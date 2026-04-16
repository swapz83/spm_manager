import type { PGlite } from '@electric-sql/pglite';

// Manager hierarchy:
// m001 (Sarah Park) manages: u001-u005, u007, u008, u015, u017
// m002 (David Foster) manages: u006, u009, u010, u012, u014, u016, u018, u020
// m003 (Priya Sharma) manages: u003, u004, u011, u013, u019

const managers = [
  { id: 'm001', user_name: 'spark', first_name: 'Sarah', last_name: 'Park', email: 'sarah.park@company.com', title: 'Engineering Manager', department: 'Engineering', manager: null },
  { id: 'm002', user_name: 'dfoster', first_name: 'David', last_name: 'Foster', email: 'david.foster@company.com', title: 'Engineering Manager', department: 'Engineering', manager: null },
  { id: 'm003', user_name: 'psharma', first_name: 'Priya', last_name: 'Sharma', email: 'priya.sharma@company.com', title: 'Design & Product Director', department: 'Design', manager: null },
];

const users = [
  { id: 'u001', user_name: 'jchen', first_name: 'Jessica', last_name: 'Chen', email: 'jessica.chen@company.com', title: 'Senior Software Engineer', department: 'Engineering', manager: 'm001' },
  { id: 'u002', user_name: 'mwilliams', first_name: 'Marcus', last_name: 'Williams', email: 'marcus.williams@company.com', title: 'Staff Engineer', department: 'Engineering', manager: 'm001' },
  { id: 'u003', user_name: 'spatel', first_name: 'Sunita', last_name: 'Patel', email: 'sunita.patel@company.com', title: 'UX Designer', department: 'Design', manager: 'm003' },
  { id: 'u004', user_name: 'akim', first_name: 'Alex', last_name: 'Kim', email: 'alex.kim@company.com', title: 'Product Manager', department: 'Product', manager: 'm003' },
  { id: 'u005', user_name: 'rjohnson', first_name: 'Rachel', last_name: 'Johnson', email: 'rachel.johnson@company.com', title: 'QA Engineer', department: 'QA', manager: 'm001' },
  { id: 'u006', user_name: 'dgarcia', first_name: 'Daniel', last_name: 'Garcia', email: 'daniel.garcia@company.com', title: 'DevOps Engineer', department: 'DevOps', manager: 'm002' },
  { id: 'u007', user_name: 'lzhang', first_name: 'Lisa', last_name: 'Zhang', email: 'lisa.zhang@company.com', title: 'Frontend Developer', department: 'Engineering', manager: 'm001' },
  { id: 'u008', user_name: 'toconnor', first_name: 'Thomas', last_name: "O'Connor", email: 'thomas.oconnor@company.com', title: 'Backend Developer', department: 'Engineering', manager: 'm001' },
  { id: 'u009', user_name: 'nsingh', first_name: 'Neha', last_name: 'Singh', email: 'neha.singh@company.com', title: 'Data Scientist', department: 'Engineering', manager: 'm002' },
  { id: 'u010', user_name: 'jmartinez', first_name: 'Juan', last_name: 'Martinez', email: 'juan.martinez@company.com', title: 'Security Engineer', department: 'Engineering', manager: 'm002' },
  { id: 'u011', user_name: 'emiller', first_name: 'Emily', last_name: 'Miller', email: 'emily.miller@company.com', title: 'Technical Writer', department: 'Product', manager: 'm003' },
  { id: 'u012', user_name: 'klee', first_name: 'Kevin', last_name: 'Lee', email: 'kevin.lee@company.com', title: 'Mobile Developer', department: 'Engineering', manager: 'm002' },
  { id: 'u013', user_name: 'abrown', first_name: 'Amanda', last_name: 'Brown', email: 'amanda.brown@company.com', title: 'UI Designer', department: 'Design', manager: 'm003' },
  { id: 'u014', user_name: 'rwilson', first_name: 'Robert', last_name: 'Wilson', email: 'robert.wilson@company.com', title: 'Platform Engineer', department: 'DevOps', manager: 'm002' },
  { id: 'u015', user_name: 'ytanaka', first_name: 'Yuki', last_name: 'Tanaka', email: 'yuki.tanaka@company.com', title: 'Full Stack Developer', department: 'Engineering', manager: 'm001' },
  { id: 'u016', user_name: 'crodriguez', first_name: 'Carlos', last_name: 'Rodriguez', email: 'carlos.rodriguez@company.com', title: 'QA Lead', department: 'QA', manager: 'm002' },
  { id: 'u017', user_name: 'hpham', first_name: 'Hannah', last_name: 'Pham', email: 'hannah.pham@company.com', title: 'Software Engineer', department: 'Engineering', manager: 'm001' },
  { id: 'u018', user_name: 'jthompson', first_name: 'James', last_name: 'Thompson', email: 'james.thompson@company.com', title: 'Architect', department: 'Engineering', manager: 'm002' },
  { id: 'u019', user_name: 'mkowalski', first_name: 'Maria', last_name: 'Kowalski', email: 'maria.kowalski@company.com', title: 'Scrum Master', department: 'Product', manager: 'm003' },
  { id: 'u020', user_name: 'bnguyen', first_name: 'Brian', last_name: 'Nguyen', email: 'brian.nguyen@company.com', title: 'ML Engineer', department: 'Engineering', manager: 'm002' },
];

const projects = [
  { id: 'p001', number: 'PRJ0001001', short_description: 'Cloud Migration Phase 2', description: 'Migrate remaining on-prem services to AWS', state: 'active', start_date: '2026-01-15', end_date: '2026-06-30', color: '#E76F51' },
  { id: 'p002', number: 'PRJ0001002', short_description: 'Mobile App Redesign', description: 'Complete redesign of the customer-facing mobile application', state: 'active', start_date: '2026-02-01', end_date: '2026-07-31', color: '#F4A261' },
  { id: 'p003', number: 'PRJ0001003', short_description: 'API Gateway v3', description: 'Build next-generation API gateway with rate limiting and auth', state: 'active', start_date: '2026-03-01', end_date: '2026-08-31', color: '#E9C46A' },
  { id: 'p004', number: 'PRJ0001004', short_description: 'Customer Portal Refresh', description: 'Modernize the customer self-service portal', state: 'planning', start_date: '2026-05-01', end_date: '2026-10-31', color: '#D4572A' },
  { id: 'p005', number: 'PRJ0001005', short_description: 'Data Pipeline Modernization', description: 'Replace legacy ETL with streaming architecture', state: 'active', start_date: '2026-01-01', end_date: '2026-09-30', color: '#BC6C25' },
  { id: 'p006', number: 'PRJ0001006', short_description: 'Security Compliance Audit', description: 'SOC2 Type II compliance remediation', state: 'active', start_date: '2026-02-15', end_date: '2026-05-31', color: '#F48C06' },
  { id: 'p007', number: 'PRJ0001007', short_description: 'ML Recommendation Engine', description: 'Build personalized recommendation system using collaborative filtering', state: 'planning', start_date: '2026-06-01', end_date: '2026-12-31', color: '#E85D04' },
  { id: 'p008', number: 'PRJ0001008', short_description: 'Internal Tools Platform', description: 'Unified platform for internal developer and operations tooling', state: 'active', start_date: '2026-03-15', end_date: '2026-11-30', color: '#C13C2E' },
];

const assignments = [
  { id: 'a001', resource: 'u001', project: 'p001', allocation_pct: 50, role: 'Tech Lead', status: 'approved' },
  { id: 'a002', resource: 'u001', project: 'p003', allocation_pct: 30, role: 'Developer', status: 'approved' },
  { id: 'a003', resource: 'u001', project: 'p008', allocation_pct: 20, role: 'Advisor', status: 'approved' },
  { id: 'a004', resource: 'u002', project: 'p001', allocation_pct: 50, role: 'Architect', status: 'approved' },
  { id: 'a005', resource: 'u002', project: 'p005', allocation_pct: 30, role: 'Tech Lead', status: 'approved' },
  { id: 'a006', resource: 'u003', project: 'p002', allocation_pct: 50, role: 'Lead Designer', status: 'approved' },
  { id: 'a007', resource: 'u003', project: 'p004', allocation_pct: 25, role: 'UX Consultant', status: 'requested' },
  { id: 'a008', resource: 'u003', project: 'p008', allocation_pct: 15, role: 'Designer', status: 'approved' },
  { id: 'a009', resource: 'u004', project: 'p002', allocation_pct: 50, role: 'Product Owner', status: 'approved' },
  { id: 'a010', resource: 'u004', project: 'p004', allocation_pct: 25, role: 'Product Lead', status: 'requested' },
  { id: 'a011', resource: 'u005', project: 'p001', allocation_pct: 30, role: 'QA Lead', status: 'approved' },
  { id: 'a012', resource: 'u005', project: 'p003', allocation_pct: 30, role: 'QA Engineer', status: 'approved' },
  { id: 'a013', resource: 'u006', project: 'p001', allocation_pct: 40, role: 'DevOps Lead', status: 'approved' },
  { id: 'a014', resource: 'u006', project: 'p005', allocation_pct: 30, role: 'Infrastructure', status: 'approved' },
  { id: 'a015', resource: 'u006', project: 'p008', allocation_pct: 30, role: 'Platform Engineer', status: 'approved' },
  { id: 'a016', resource: 'u007', project: 'p002', allocation_pct: 50, role: 'Frontend Lead', status: 'approved' },
  { id: 'a017', resource: 'u007', project: 'p004', allocation_pct: 20, role: 'Frontend Dev', status: 'requested' },
  { id: 'a018', resource: 'u008', project: 'p003', allocation_pct: 50, role: 'Backend Lead', status: 'approved' },
  { id: 'a019', resource: 'u008', project: 'p005', allocation_pct: 30, role: 'Developer', status: 'approved' },
  { id: 'a020', resource: 'u009', project: 'p005', allocation_pct: 40, role: 'Data Lead', status: 'approved' },
  { id: 'a021', resource: 'u009', project: 'p007', allocation_pct: 20, role: 'ML Advisor', status: 'requested' },
  { id: 'a022', resource: 'u010', project: 'p006', allocation_pct: 50, role: 'Security Lead', status: 'approved' },
  { id: 'a024', resource: 'u012', project: 'p002', allocation_pct: 60, role: 'Mobile Lead', status: 'approved' },
  { id: 'a025', resource: 'u012', project: 'p008', allocation_pct: 20, role: 'Mobile Consultant', status: 'approved' },
  { id: 'a026', resource: 'u013', project: 'p002', allocation_pct: 30, role: 'Visual Designer', status: 'approved' },
  { id: 'a027', resource: 'u013', project: 'p004', allocation_pct: 20, role: 'UI Designer', status: 'requested' },
  { id: 'a028', resource: 'u014', project: 'p001', allocation_pct: 30, role: 'Platform Engineer', status: 'approved' },
  { id: 'a029', resource: 'u014', project: 'p005', allocation_pct: 30, role: 'Infrastructure', status: 'approved' },
  { id: 'a030', resource: 'u014', project: 'p008', allocation_pct: 30, role: 'Platform Lead', status: 'approved' },
  { id: 'a031', resource: 'u015', project: 'p003', allocation_pct: 40, role: 'Full Stack Dev', status: 'approved' },
  { id: 'a032', resource: 'u015', project: 'p008', allocation_pct: 30, role: 'Developer', status: 'approved' },
  { id: 'a033', resource: 'u016', project: 'p006', allocation_pct: 40, role: 'QA Lead', status: 'approved' },
  { id: 'a035', resource: 'u020', project: 'p007', allocation_pct: 40, role: 'ML Engineer', status: 'requested' },
];

export async function seed(db: PGlite) {
  const existing = await db.query('SELECT COUNT(*) as cnt FROM sys_user');
  if (Number((existing.rows[0] as any).cnt) > 0) return;

  // Insert managers first (they have no manager reference)
  for (const m of managers) {
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(m.first_name + ' ' + m.last_name)}&background=random&size=128`;
    await db.query(
      `INSERT INTO sys_user (sys_id, user_name, first_name, last_name, email, title, department, manager, avatar_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [m.id, m.user_name, m.first_name, m.last_name, m.email, m.title, m.department, m.manager, avatar]
    );
  }

  // Insert users with manager references
  for (const u of users) {
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(u.first_name + ' ' + u.last_name)}&background=random&size=128`;
    await db.query(
      `INSERT INTO sys_user (sys_id, user_name, first_name, last_name, email, title, department, manager, avatar_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [u.id, u.user_name, u.first_name, u.last_name, u.email, u.title, u.department, u.manager, avatar]
    );
  }

  for (const p of projects) {
    await db.query(
      `INSERT INTO pm_project (sys_id, number, short_description, description, state, start_date, end_date, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [p.id, p.number, p.short_description, p.description, p.state, p.start_date, p.end_date, p.color]
    );
  }

  for (const a of assignments) {
    await db.query(
      `INSERT INTO sn_plng_att_core_resource_assignment (sys_id, resource, project, allocation_pct, resource_status, role)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [a.id, a.resource, a.project, a.allocation_pct, a.status, a.role]
    );
  }

  console.log('Database seeded successfully');
}
