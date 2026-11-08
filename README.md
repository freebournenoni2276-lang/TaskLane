# Tasklane
Tasklane is a polished Kanban task board built for the Next Play Games Software Development internship assessment. It helps guests organise work across four workflow stages, keep track of deadlines, and add comments to tasks.

# Live demo: https://tasklane-eta.vercel.app/

# Features
- Four Kanban columns: To Do, In Progress, In Review, and Done
- Create, edit, and delete tasks
- Drag tasks between columns to update their status
- Optional descriptions, priority levels, and due dates
- Visual indicators for tasks due soon or overdue
- Task comments with timestamps
- Board summary for total, completed, and overdue tasks
- Guest accounts created automatically with Supabase Auth anonymous sign-in
- Supabase Postgres persistence with Row Level Security (RLS)
- Optional team roster: add named members with avatar colours and assign one or more members to tasks
- Responsive layout for smaller screens
  
# Technology
- HTML, CSS, and vanilla JavaScript
- Supabase Auth and Postgres
- Vercel hosting
  
# How guest accounts work
When a visitor opens the board, Tasklane reuses the guest session stored in that browser or creates a new anonymous session. Tasks and comments are associated with that guest's Supabase user ID. RLS policies restrict access to rows owned by the active guest, so different guests using the same website see separate task boards.

Guest sessions do not require an email or password. They are tied to the browser's saved session; clearing browser data or switching devices can make the previous guest board inaccessible.

The optional team roster stores names and avatar colours on the current guest's board. Team members are not separate login accounts, and the roster does not make a board shared across guests.

# Run locally
1. Clone or download this repository and open its project folder in VS Code.
2. In the Supabase dashboard, enable Authentication → Anonymous Sign-Ins.
3. Open SQL Editor in the same Supabase project, paste the full contents of [`supabase-schema.sql`](supabase-schema.sql), and run it. The script creates the tables and RLS policies for tasks, comments, team members, and task assignments. It can be rerun to add the team tables to an earlier Tasklane database without deleting existing task rows.
4. Open [`supabase-config.js`](supabase-config.js) and set the Project URL and publishable key:
   window.TASKLANE_CONFIG = {
     supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
     supabaseKey: "YOUR_SUPABASE_PUBLISHABLE_KEY"
   };
5. Serve index.html with VS Code Live Server or another local static web server. Opening it directly as a file:// page may prevent Supabase requests from working correctly.
The publishable key is intended for client-side use. Do not put a Supabase secret key or service-role key in this project or commit one to GitHub. RLS is what restricts data access from the browser.

# Use the board
- Select Add task to create a task. A title is required.
- Open a task card to view details, change its status, edit it, delete it, or add a comment.
- Drag a task card to another column to move it.
- Select Manage team or Add member to add a name and avatar colour.
- When creating or editing a task, use the Assignees field to choose one or more team members. Use Ctrl-click on Windows/Linux or Command-click on macOS to select multiple names.
  
# Database tables
- tasks: task title, status, description, priority, due date, owner user ID, and creation time
- comments: comment body, task ID, owner user ID, and creation time
- team_members: member name, avatar colour, owner user ID, and creation time
- task_assignees: join table linking tasks to one or more team members
The complete schema and RLS policies are in [`supabase-schema.sql`](supabase-schema.sql).

# Deployment
The frontend is a static site. Deploy the project folder with Vercel, Netlify, Cloudflare Pages, or another static host. Set the publish/output directory to the folder containing index.html. Configure supabase-config.js with the correct Supabase Project URL and publishable key before deploying.

# Trade-offs and possible improvements
- Anonymous accounts make it quick to try Tasklane, but do not support account recovery or reliable access across devices. Email, OAuth, or another permanent sign-in method could be added later.
- Team members are board-local profiles rather than authenticated collaborators. Shared team boards would need user accounts, board membership records, invitations, and membership-based RLS policies.
- Additional improvements could include search and filters, labels, activity history, realtime updates, and account conversion for guest users.
