const statuses = ["todo", "in_progress", "in_review", "done"];
const statusLabels = { todo: "To Do", in_progress: "In Progress", in_review: "In Review", done: "Done" };

let supabaseClient = null;
let currentUser = null;
let tasks = [];
let selectedTaskId = null;
let editingTaskId = null;
let isLoading = true;

const taskDialog = document.getElementById("taskDialog");
const detailsDialog = document.getElementById("detailsDialog");
const taskForm = document.getElementById("taskForm");
const commentForm = document.getElementById("commentForm");
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

  tasks = rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description || "",
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date || "",
    createdAt: row.created_at,
    comments: commentRows
      .filter((comment) => comment.task_id === row.id)
      .map((comment) => ({ id: comment.id, text: comment.body, createdAt: comment.created_at }))
  }));

  isLoading = false;
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

function openTaskDetails(taskId) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return;
  selectedTaskId = taskId;
  document.getElementById("detailsTitle").textContent = task.title;
  document.getElementById("detailsDescription").textContent = task.description || "No description added.";
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

  const wasEditing = Boolean(editingTaskId);
  const editedId = editingTaskId;
  let error;
  if (wasEditing) {
    ({ error } = await supabaseClient.from("tasks").update(values).eq("id", editingTaskId));
  } else {
    ({ error } = await supabaseClient.from("tasks").insert({ ...values, user_id: currentUser.id }));
  }

  if (error) {
    setNotice(`Could not ${wasEditing ? "update" : "create"} the task: ${error.message}`, "error");
    return;
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
