export interface SysUser {
  sys_id: string;
  user_name: string;
  first_name: string;
  last_name: string;
  email: string;
  title: string | null;
  department: string | null;
  manager: string | null;
  avatar_url: string | null;
  active: boolean;
}

export interface PmProject {
  sys_id: string;
  number: string;
  short_description: string;
  description: string | null;
  state: string;
  start_date: string | null;
  end_date: string | null;
  project_manager: string | null;
  color: string | null;
}

export interface ResourceAssignment {
  sys_id: string;
  resource: string;
  project: string;
  allocation_pct: number;
  resource_status: string;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface AssignmentWithDetails extends ResourceAssignment {
  resource_name: string;
  resource_title: string | null;
  resource_avatar: string | null;
  project_name: string;
  project_color: string | null;
}

export interface ProjectWithAssignments extends PmProject {
  assignments: AssignmentWithDetails[];
}

export interface PersonWithUtilization extends SysUser {
  total_allocation: number;
  assignments: AssignmentWithDetails[];
}
