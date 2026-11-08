const statuses = ["todo", "in_progress", "in_review", "done"];
const statusLabels = { todo: "To Do", in_progress: "In Progress", in_review: "In Review", done: "Done" };

let supabaseClient = null;
let currentUser = null;
let tasks = [];
let teamMembers = [];
let selectedTaskId = null;
let editingTaskId = null;
let isLoading = true;

const taskDialog = document.getElementById("taskDialog");
const detailsDialog = document.getElementById("detailsDialog");
const teamDialog = document.getElementById("teamDialog");
const taskForm = document.getElementById("taskForm");
const commentForm = document.getElementById("commentForm");
const teamMemberForm = document.getElementById("teamMemberForm");
const connectionStatus = document.getElementById("connectionStatus");

function setNotice(message, type = "") {
  connectionStatus.textContent = message;
  connectionStatus.className = `prototype-note ${type ? `notice-${type}` : ""}`;
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function memberInitials(member) {
  return member.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
}

function renderTeamMembers() {
  const strip = document.getElementById("teamMemberList");
  const managedList = document.getElementById("managedTeamList");
  const assigneeSelect = document.getElementById("taskAssignees");

  strip.innerHTML = teamMembers.length
    ? teamMembers.map((member) => `<span class="team-person" title="${escapeHTML(member.name)}"><span class="team-avatar" style="--member-color:${escapeHTML(member.color)}">${escapeHTML(memberInitials(member))}</span><span>${escapeHTML(member.name)}</span></span>`).join("")
    : `<span class="team-empty">Add team members to assign tasks.</span>`;

  managedList.innerHTML = teamMembers.length
    ? teamMembers.map((member) => `<div class="managed-member"><span class="team-avatar" style="--member-color:${escapeHTML(member.color)}">${escapeHTML(memberInitials(member))}</span><span class="managed-member-name">${escapeHTML(member.name)}</span><button class="member-remove" type="button" data-remove-member="${escapeHTML(member.id)}" aria-label="Remove ${escapeHTML(member.name)}">Remove</button></div>`).join("")
    : `<p class="team-empty">No team members yet. Add one above.</p>`;

  const selected = new Set(Array.from(assigneeSelect.selectedOptions, (option) => option.value));
  assigneeSelect.innerHTML = teamMembers.map((member) => `<option value="${escapeHTML(member.id)}">${escapeHTML(member.name)}</option>`).join("");
  Array.from(assigneeSelect.options).forEach((option) => { option.selected = selected.has(option.value); });
}

function renderTaskAssignees(task) {
  const assigned = (task.assigneeIds || []).map((id) => teamMembers.find((member) => member.id === id)).filter(Boolean);
  if (!assigned.length) return "";
  return `<div class="task-assignees" aria-label="Assigned to ${escapeHTML(assigned.map((member) => member.name).join(", "))}">${assigned.map((member) => `<span class="team-avatar task-avatar" title="${escapeHTML(member.name)}" style="--member-color:${escapeHTML(member.color)}">${escapeHTML(memberInitials(member))}</span>`).join("")}</div>`;
}

function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(dateString) {
  if (!dateString) return "No due date";
  return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dueDateInfo(task) {
  if (!task.dueDate || task.status === "done") return { label: "", className: "" };
  const today = localDateString();
  if (task.dueDate < today) return { label: `Overdue · ${formatDate(task.dueDate)}`, className: "overdue" };
  if (task.dueDate === today) return { label: "Due today", className: "soon" };
  const dayAfterTomorrow = new Date();
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
  if (task.dueDate < localDateString(dayAfterTomorrow)) return { label: `Due soon · ${formatDate(task.dueDate)}`, className: "soon" };
  return { label: formatDate(task.dueDate), className: "" };
}

function renderBoard() {
  statuses.forEach((status) => {
    const list = document.querySelector(`[data-task-list="${status}"]`);
    const columnTasks = tasks.filter((task) => task.status === status);
    document.getElementById(`count-${status}`).textContent = columnTasks.length;

    if (isLoading) {
      list.innerHTML = `<p class="empty-state">Loading tasks…</p>`;
    } else if (columnTasks.length === 0) {
      list.innerHTML = `<p class="empty-state">Drop a task here</p>`;
    } else {
      list.innerHTML = columnTasks.map((task) => {
        const due = dueDateInfo(task);
        const comments = task.comments || [];
        return `<article class="task-card" draggable="true" data-task-id="${escapeHTML(task.id)}" tabindex="0" aria-label="${escapeHTML(task.title)}. Drag to move between columns.">
          <h3 class="task-title">${escapeHTML(task.title)}</h3>
          ${task.description ? `<p class="task-description">${escapeHTML(task.description)}</p>` : ""}
          <div class="task-meta"><span class="priority priority-${escapeHTML(task.priority)}">${escapeHTML(task.priority)} priority</span>
            ${due.label ? `<span class="due-badge ${due.className}">◷ ${escapeHTML(due.label)}</span>` : ""}</div>
          ${renderTaskAssignees(task)}
          <div class="card-footer"><button class="comment-link" type="button" data-open-details="${escapeHTML(task.id)}">💬 ${comments.length} ${comments.length === 1 ? "comment" : "comments"}</button><span class="grip" aria-hidden="true">⠿</span></div>
        </article>`;
      }).join("");
    }
  });

  document.getElementById("totalCount").textContent = tasks.length;
  document.getElementById("completedCount").textContent = tasks.filter((task) => task.status === "done").length;
  document.getElementById("overdueCount").textContent = tasks.filter((task) => dueDateInfo(task).className === "overdue").length;
}

async function refreshTasks() {
  if (!supabaseClient || !currentUser) return;
  isLoading = true;
  renderBoard();

  const { data: rows, error } = await supabaseClient
    .from("tasks")
    .select("id, title, description, status, priority, due_date, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    isLoading = false;
    renderBoard();
    setNotice(`Could not load tasks: ${error.message}`, "error");
    return false;
  }

  let commentRows = [];
  if (rows.length > 0) {
    const { data, error: commentError } = await supabaseClient
      .from("comments")
      .select("id, task_id, body, created_at")
      .in("task_id", rows.map((task) => task.id))
      .order("created_at", { ascending: true });
    if (commentError) {
      isLoading = false;
      renderBoard();
      setNotice(`Tasks loaded, but comments could not be loaded: ${commentError.message}`, "error");
      return false;
    }
    commentRows = data;
  }

  const { data: memberRows, error: memberError } = await supabaseClient
    .from("team_members")
    .select("id, name, color")
    .order("created_at", { ascending: true });
  if (memberError) {
    isLoading = false;
    renderBoard();
    setNotice(`Tasks loaded, but team members could not be loaded: ${memberError.message}`, "error");
    return false;
  }
  teamMembers = memberRows;

  let assignmentRows = [];
  if (rows.length > 0) {
    const { data, error: assignmentError } = await supabaseClient
      .from("task_assignees")
      .select("task_id, team_member_id")
      .in("task_id", rows.map((task) => task.id));
    if (assignmentError) {
      isLoading = false;
      renderBoard();
      setNotice(`Tasks loaded, but assignments could not be loaded: ${assignmentError.message}`, "error");
      return false;
    }
    assignmentRows = data;
  }

  tasks = rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description || "",
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date || "",
    createdAt: row.created_at,
    assigneeIds: assignmentRows.filter((assignment) => assignment.task_id === row.id).map((assignment) => assignment.team_member_id),
    comments: commentRows
      .filter((comment) => comment.task_id === row.id)
      .map((comment) => ({ id: comment.id, text: comment.body, createdAt: comment.created_at }))
  }));

  isLoading = false;
  renderTeamMembers();
  renderBoard();
  return true;
}

async function initialiseSupabase() {
  const config = window.TASKLANE_CONFIG;
  if (!config || config.supabaseUrl.includes("YOUR_") || config.supabaseKey.includes("YOUR_")) {
    isLoading = false;
    renderBoard();
    setNotice("Add your Supabase Project URL and publishable key in supabase-config.js.", "error");
    return;
  }

  try {
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;

    let session = sessionData.session;
    if (!session) {
      const { data, error } = await supabaseClient.auth.signInAnonymously();
      if (error) throw error;
      session = data.session;
    }

    currentUser = session.user;
    const loaded = await refreshTasks();
    if (loaded) setNotice("Connected as a guest. Your tasks are saved to Supabase.", "success");
  } catch (error) {
    isLoading = false;
    renderBoard();
    setNotice(`Could not connect to Supabase: ${error.message}`, "error");
  }
}

function openTeamManager() {
  if (!currentUser) {
    setNotice("Connect to Supabase before managing team members.", "error");
    return;
  }
  renderTeamMembers();
  teamDialog.showModal();
}

document.getElementById("openTeamDialog").addEventListener("click", openTeamManager);
document.getElementById("teamQuickAdd").addEventListener("click", openTeamManager);

teamMemberForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;
  const name = document.getElementById("memberName").value.trim();
  const color = document.getElementById("memberColor").value;
  if (!name) return;
  const { error } = await supabaseClient.from("team_members").insert({ name, color, user_id: currentUser.id });
  if (error) {
    setNotice(`Could not add team member: ${error.message}`, "error");
    return;
  }
  teamMemberForm.reset();
  document.getElementById("memberColor").value = "#4e79cf";
  if (await refreshTasks()) setNotice(`${name} added to your team.`, "success");
});

document.getElementById("managedTeamList").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-member]");
  if (!button) return;
  const member = teamMembers.find((item) => item.id === button.dataset.removeMember);
  if (!member || !confirm(`Remove ${member.name} from your team? Their task assignments will be removed too.`)) return;
  const { error } = await supabaseClient.from("team_members").delete().eq("id", member.id);
  if (error) {
    setNotice(`Could not remove team member: ${error.message}`, "error");
    return;
  }
  if (await refreshTasks()) setNotice(`${member.name} removed from your team.`, "success");
});

function openTaskDetails(taskId) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return;
  selectedTaskId = taskId;
  document.getElementById("detailsTitle").textContent = task.title;
  document.getElementById("detailsDescription").textContent = task.description || "No description added.";
  const assignedMembers = (task.assigneeIds || []).map((id) => teamMembers.find((member) => member.id === id)).filter(Boolean);
  document.getElementById("detailsAssignees").innerHTML = assignedMembers.length
    ? `<strong>Assigned to</strong> ${assignedMembers.map((member) => `<span class="team-person"><span class="team-avatar" style="--member-color:${escapeHTML(member.color)}">${escapeHTML(memberInitials(member))}</span>${escapeHTML(member.name)}</span>`).join("")}`
    : "";
  document.getElementById("detailsPriority").textContent = `${task.priority} priority`;
  document.getElementById("detailsDueDate").textContent = task.dueDate ? `Due ${formatDate(task.dueDate)}` : "No due date";
  document.getElementById("detailsStatus").value = task.status;
  renderComments(task);
  detailsDialog.showModal();
}

function renderComments(task) {
  const comments = task.comments || [];
  document.getElementById("commentCount").textContent = comments.length;
  const list = document.getElementById("commentList");
  list.innerHTML = comments.length ? comments.map((comment) => `<article class="comment-item"><p class="comment-text">${escapeHTML(comment.text)}</p><time class="comment-time">${new Date(comment.createdAt).toLocaleString()}</time></article>`).join("") : `<p class="comment-empty">No comments yet. Start the conversation.</p>`;
}

function prepareNewTaskForm() {
  if (!currentUser) {
    setNotice("Connect to Supabase before creating tasks.", "error");
    return;
  }
  editingTaskId = null;
  taskForm.reset();
  renderTeamMembers();
  document.getElementById("taskDialogTitle").textContent = "Add a task";
  taskForm.querySelector('[type="submit"]').textContent = "Create task";
  taskDialog.showModal();
}

function prepareEditTaskForm() {
  const task = tasks.find((item) => item.id === selectedTaskId);
  if (!task) return;
  editingTaskId = task.id;
  taskForm.elements.title.value = task.title;
  taskForm.elements.description.value = task.description || "";
  taskForm.elements.status.value = task.status;
  taskForm.elements.priority.value = task.priority;
  taskForm.elements.dueDate.value = task.dueDate || "";
  renderTeamMembers();
  Array.from(document.getElementById("taskAssignees").options).forEach((option) => {
    option.selected = (task.assigneeIds || []).includes(option.value);
  });
  document.getElementById("taskDialogTitle").textContent = "Edit task";
  taskForm.querySelector('[type="submit"]').textContent = "Save changes";
  detailsDialog.close();
  taskDialog.showModal();
}

async function updateTask(taskId, values) {
  const { error } = await supabaseClient.from("tasks").update(values).eq("id", taskId);
  if (error) {
    setNotice(`Could not save the task: ${error.message}`, "error");
    await refreshTasks();
    return false;
  }
  await refreshTasks();
  return true;
}

document.getElementById("openTaskForm").addEventListener("click", prepareNewTaskForm);
document.getElementById("editTask").addEventListener("click", prepareEditTaskForm);

document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => document.getElementById(button.dataset.close).close());
});

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return setNotice("Connect to Supabase before saving tasks.", "error");
  const formData = new FormData(taskForm);
  const values = {
    title: formData.get("title").trim(),
    description: formData.get("description").trim() || null,
    status: formData.get("status"),
    priority: formData.get("priority"),
    due_date: formData.get("dueDate") || null
  };
  const assigneeIds = Array.from(document.getElementById("taskAssignees").selectedOptions, (option) => option.value);

  const wasEditing = Boolean(editingTaskId);
  const editedId = editingTaskId;
  let createdTaskId = null;
  let error;
  if (wasEditing) {
    ({ error } = await supabaseClient.from("tasks").update(values).eq("id", editingTaskId));
  } else {
    let createdTask;
    ({ data: createdTask, error } = await supabaseClient.from("tasks").insert({ ...values, user_id: currentUser.id }).select("id").single());
    if (!error) createdTaskId = createdTask.id;
  }

  if (error) {
    setNotice(`Could not ${wasEditing ? "update" : "create"} the task: ${error.message}`, "error");
    return;
  }

  const taskId = wasEditing ? editedId : createdTaskId;
  const { error: clearAssignmentsError } = await supabaseClient.from("task_assignees").delete().eq("task_id", taskId);
  if (clearAssignmentsError) {
    setNotice(`Task saved, but assignees could not be updated: ${clearAssignmentsError.message}`, "error");
    return;
  }
  if (assigneeIds.length) {
    const { error: assignmentError } = await supabaseClient.from("task_assignees").insert(assigneeIds.map((teamMemberId) => ({ task_id: taskId, team_member_id: teamMemberId })));
    if (assignmentError) {
      setNotice(`Task saved, but assignees could not be updated: ${assignmentError.message}`, "error");
      return;
    }
  }

  editingTaskId = null;
  taskForm.reset();
  taskDialog.close();
  const loaded = await refreshTasks();
  if (loaded) setNotice(wasEditing ? "Task updated." : "Task created.", "success");
  if (wasEditing) openTaskDetails(editedId);
});

commentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser || !selectedTaskId) return;
  const input = document.getElementById("commentInput");
  const text = input.value.trim();
  if (!text) return;

  const { error } = await supabaseClient.from("comments").insert({
    task_id: selectedTaskId,
    user_id: currentUser.id,
    body: text
  });
  if (error) {
    setNotice(`Could not post comment: ${error.message}`, "error");
    return;
  }
  commentForm.reset();
  const taskId = selectedTaskId;
  if (await refreshTasks()) openTaskDetails(taskId);
});

document.getElementById("detailsStatus").addEventListener("change", async (event) => {
  const task = tasks.find((item) => item.id === selectedTaskId);
  if (!task) return;
  const taskId = task.id;
  if (await updateTask(taskId, { status: event.target.value })) {
    const updatedTask = tasks.find((item) => item.id === taskId);
    if (updatedTask) document.getElementById("detailsStatus").value = updatedTask.status;
  }
});

document.getElementById("deleteTask").addEventListener("click", async () => {
  if (!selectedTaskId || !confirm("Delete this task and its comments?")) return;
  const { error } = await supabaseClient.from("tasks").delete().eq("id", selectedTaskId);
  if (error) {
    setNotice(`Could not delete the task: ${error.message}`, "error");
    return;
  }
  detailsDialog.close();
  await refreshTasks();
  setNotice("Task deleted.", "success");
});

document.querySelectorAll(".board-column").forEach((column) => {
  const list = column.querySelector(".task-list");
  list.addEventListener("dragover", (event) => event.preventDefault());
  list.addEventListener("dragenter", () => list.classList.add("drag-target"));
  list.addEventListener("dragleave", (event) => {
    if (!list.contains(event.relatedTarget)) list.classList.remove("drag-target");
  });
  list.addEventListener("drop", async (event) => {
    event.preventDefault();
    list.classList.remove("drag-target");
    const taskId = event.dataTransfer.getData("text/plain");
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status === column.dataset.status) return;
    if (await updateTask(taskId, { status: column.dataset.status })) setNotice("Task moved.", "success");
  });
});

document.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".task-card");
  if (!card) return;
  card.classList.add("dragging");
  event.dataTransfer.setData("text/plain", card.dataset.taskId);
  event.dataTransfer.effectAllowed = "move";
});

document.addEventListener("dragend", (event) => event.target.closest(".task-card")?.classList.remove("dragging"));

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-details]");
  if (button) openTaskDetails(button.dataset.openDetails);
});

document.addEventListener("keydown", (event) => {
  const card = event.target.closest(".task-card");
  if (card && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    openTaskDetails(card.dataset.taskId);
  }
});

renderBoard();
initialiseSupabase();
