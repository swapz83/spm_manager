(async () => {
    const projectNumbers = ['PRJ0206138', 'PRJ0206193']; // <-- ECP Core KTLO and UEP
    const userEmails = ["rk2@ap.equinix.com"]; 
    const startDate = '2026-04-01';
    const endDate = '2026-12-31';
    let projects = [];
    let users = [];
    let failedProjects = [];
    let failedUsers = [];
    let successfulEndings = [];
    let failedEndings = [];
    let allocationEfforts = [];
    let successfulAllocations = [];
    let failedAllocations = [];
    
    // This token bypasses the need for re-authentication by using your current browser session
    const userToken = window.g_ck; 

    if (!userToken) {
        console.error("Session token (g_ck) not found. Are you sure you're logged into ServiceNow?");
        return;
    }

    const requestHeaders = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-UserToken': userToken
    };

    try {
        // Iterate through each project
        for (const projectNumber of projectNumbers) {
            console.log(`\n========== Processing Project: ${projectNumber} ==========`);
            console.log("Locating Project...");
            
            // 1. Get Project SysID
            const projResp = await fetch(`/api/now/table/pm_project?sysparm_query=number=${projectNumber}&sysparm_fields=sys_id`, {
                method: 'GET',
                headers: requestHeaders
            });
            
            const projData = await projResp.json();
            if (!projData.result || !projData.result.length) {
                console.error(`Project ${projectNumber} not found. Skipping...`);
                failedProjects.push(projectNumber);
                continue;
            }
            const projectSysId = projData.result[0].sys_id;
            console.log(`Found ${projectSysId} for Project Number ${projectNumber}. Onward to finding users...`);
            projects.push({ projectNumber: projectNumber, projectSysId: projectSysId });
        }         
        
        if (projects.length > 0) {
            const projectsCount = projects.length;
            // 1. Calculate the base value rounded to 1 decimal place
            const baseAllocation = Math.floor((1 / projectsCount) * 10) / 10;
            
            // 2. Fill the array with the base value
            allocationEfforts = new Array(projectsCount).fill(baseAllocation);
            
            // 3. Calculate the difference (the "rounding error")
            const currentSum = allocationEfforts.reduce((a, b) => a + b, 0);
            const remainder = 1 - currentSum;
            
            // 4. Add the remainder to the last element to ensure total is exactly 1.0
            // We use Number.parseFloat().toFixed(1) to avoid floating point noise (e.g., 0.4000000000004)
            allocationEfforts[projectsCount - 1] = parseFloat((allocationEfforts[projectsCount - 1] + remainder).toFixed(1));
        }

        // Iterate through each email for this project
        for (const email of userEmails) {
            console.log(`Searching for user: ${email}...`);
            
            // 3. Find User SysID by Email
            const userResp = await fetch(`/api/now/table/sys_user?sysparm_query=email=${email}&sysparm_fields=sys_id,name`, {
                method: 'GET',
                headers: requestHeaders
            });
            const userData = await userResp.json();
            
            if (!userData.result || !userData.result.length) {
                console.error(`User record not found for: ${email}`);
                failedUsers.push(email);
                continue;
            }

            const user = userData.result[0];
            console.log(`Found ${user.name} with SysID ${user.sys_id} for email ${email}.`);
            users.push({ email: email, userSysId: user.sys_id, name: user.name });
        }

        // 1. Calculate the termination date (1 day before start)
        let endPrevious = new Date(startDate);
        endPrevious.setDate(endPrevious.getDate() - 1);
        const endPreviousStr = endPrevious.toISOString().split('T')[0]; // Format: YYYY-MM-DD

        for (const user of users) {
            const query = `user_resource=${user.userSysId}^end_date>=${startDate}`;
            const findResp = await fetch(`/api/now/table/sn_plng_att_core_resource_assignment?sysparm_query=${query}&sysparm_fields=sys_id,task.number,end_date`, {
                headers: requestHeaders
            });
            const activeAssignments = await findResp.json();

            if (activeAssignments.result.length === 0) {
                console.log("No overlapping assignments found.");
            }

            // 4. Update each overlapping assignment
            for (const assignment of activeAssignments.result) {
                console.log(`Updating Project ${assignment['task.number']}: New end date ${endPreviousStr}`);

                const patchResp = await fetch(`/api/now/table/sn_plng_att_core_resource_assignment/${assignment.sys_id}`, {
                    method: 'PATCH',
                    headers: requestHeaders,
                    body: JSON.stringify({
                        "end_date": endPreviousStr,
                        "resource_status": "approved"
                    })
                });

                if (patchResp.ok) {
                    // WAIT: Give the Business Rules 500ms to finish their "Pending" reset
                    await new Promise(resolve => setTimeout(resolve, 500));

                    console.log(`Step 2: Explicitly Re-approving ${assignment['task.number']}...`);
                    
                    // EXECUTE STEP 2: Force Approval
                    const appvResp = await fetch(`/api/now/table/sn_plng_att_core_resource_assignment/${assignment.sys_id}`, {
                        method: 'PATCH',
                        headers: requestHeaders,
                        body: JSON.stringify({ "resource_status": "approved" })
                    });
                    if (appvResp.ok) {
                        console.log(`✅ ${assignment['task.number']} is now approved.`);
                    } else {
                        const err = await appvResp.json();
                        console.error(`Failed to re-approve ${assignment['task.number']}:`, err.error ? err.error.message : appvResp.statusText);
                    }
                
                    console.log(`✅ Successfully updated ${assignment.sys_id} for userName: ${user.name}, projectId: ${assignment['task.number']}`);
                    successfulEndings.push({ userEmail: user.email, userName: user.name, projectId: assignment['task.number'], assignmentSysId: assignment.sys_id });
                } else {
                    const err = await patchResp.json();
                    console.error(`Failed to end existing assignments for ${user.name}:`, err.error ? err.error.message : patchResp.statusText);
                    failedEndings.push({ userEmail: user.email, userName: user.name, errorMessage: err.error ? err.error.message : patchResp.statusText });
                }
            }
        }
        for (const project of projects) {
            for (const user of users) {
                const planPayload = {
                    "task": project.projectSysId,
                    "user_resource": user.userSysId,
                    "assignment_type": "user",
                    "effort_type": "fte",
                    "effort": allocationEfforts[projects.indexOf(project)],
                    "start_date": startDate,
                    "end_date": endDate, 
                    "resource_status": "approved"
                };
                const planResp = await fetch('/api/now/table/sn_plng_att_core_resource_assignment', {
                    method: 'POST',
                    headers: requestHeaders,
                    body: JSON.stringify(planPayload)
                });

                if (planResp.ok) {
                    const planResult = await planResp.json();
                    console.log(`✅ Success: ${user.name} allocated to ${project.projectNumber}. Plan ID: ${planResult.result.number}`);
                    successfulAllocations.push({ projectNumber: project.projectNumber, userEmail: user.email, planId: planResult.result.sys_id });
                } else {
                    const err = await planResp.json();
                    console.error(`❌ Allocation failed for ${user.name} on ${project.projectNumber}:`, err.error ? err.error.message : planResp.statusText);
                    failedAllocations.push({ projectNumber: project.projectNumber, userEmail: user.email, errorMessage: err.error ? err.error.message : planResp.statusText });
                }

            }

        }
    
    } catch (err) {
        console.error("Script Execution Error:", err.message);
    }
})();