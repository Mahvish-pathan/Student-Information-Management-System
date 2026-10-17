const API = `${window.APP_CONFIG.API_BASE_URL.replace(/\/$/, "")}/api/students`;

const $ = (id) => document.getElementById(id);
const form = $("studentForm");
const fields = ["studentId", "name", "email", "department", "year", "phone"];

let students = [];
let searchTimer;

// ---------- helpers ----------
function toast(message, type = "success") {
  const el = $("toast");
  el.textContent = message;
  el.className = `toast ${type} show`;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.className = "toast"), 3000);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

async function request(url, options = {}) {
  let res;
  try {
    res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (e) {
    throw new Error("Cannot reach the server. If it is hosted on Render's free plan, it may be waking up - try again in about a minute.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

// ---------- validation ----------
function validate() {
  let ok = true;
  fields.forEach((f) => $(f).classList.remove("invalid"));
  const mark = (f) => { $(f).classList.add("invalid"); ok = false; };

  ["studentId", "name", "department", "year"].forEach((f) => {
    if (!$(f).value.trim()) mark(f);
  });
  if (!/^\S+@\S+\.\S+$/.test($("email").value.trim())) mark("email");
  const phone = $("phone").value.trim();
  if (phone && !/^[0-9+\-\s]{7,15}$/.test(phone)) mark("phone");

  if (!ok) toast("Please fix the highlighted fields", "error");
  return ok;
}

// ---------- rendering ----------
function render() {
  $("count").textContent = students.length;
  const tbody = $("tbody");
  tbody.innerHTML = students
    .map(
      (s) => `
    <tr>
      <td>${escapeHtml(s.studentId)}</td>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.email)}</td>
      <td>${escapeHtml(s.department)}</td>
      <td>${escapeHtml(s.year)}</td>
      <td>${escapeHtml(s.phone || "-")}</td>
      <td class="actions-cell">
        <button class="btn small" data-action="edit" data-id="${s._id}">Edit</button>
        <button class="btn small danger" data-action="delete" data-id="${s._id}">Delete</button>
      </td>
    </tr>`
    )
    .join("");
}

function setStatus(text) { $("status").textContent = text; }

// ---------- API actions ----------
async function loadStudents() {
  const term = $("search").value.trim();
  setStatus("Loading...");
  try {
    students = await request(term ? `${API}?search=${encodeURIComponent(term)}` : API);
    render();
    setStatus(students.length ? "" : term ? "No students match your search." : "No student records yet. Add one above.");
  } catch (err) {
    students = [];
    render();
    setStatus("");
    toast(err.message, "error");
    setStatus(err.message);
  }
}

async function saveStudent(e) {
  e.preventDefault();
  if (!validate()) return;

  const body = {
    studentId: $("studentId").value.trim(),
    name: $("name").value.trim(),
    email: $("email").value.trim(),
    department: $("department").value.trim(),
    year: Number($("year").value),
    phone: $("phone").value.trim(),
  };
  const id = $("recordId").value;
  const btn = $("submitBtn");
  btn.disabled = true;

  try {
    if (id) {
      await request(`${API}/${id}`, { method: "PUT", body: JSON.stringify(body) });
      toast("Student updated");
    } else {
      await request(API, { method: "POST", body: JSON.stringify(body) });
      toast("Student added");
    }
    resetForm();
    await loadStudents();
  } catch (err) {
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

function startEdit(id) {
  const s = students.find((x) => x._id === id);
  if (!s) return;
  $("recordId").value = s._id;
  fields.forEach((f) => ($(f).value = s[f] ?? ""));
  $("formTitle").textContent = "Update Student";
  $("submitBtn").textContent = "Update Student";
  $("cancelBtn").hidden = false;
  form.scrollIntoView({ behavior: "smooth" });
}

async function deleteStudent(id) {
  const s = students.find((x) => x._id === id);
  if (!confirm(`Delete ${s ? s.name : "this student"}?`)) return;
  try {
    await request(`${API}/${id}`, { method: "DELETE" });
    toast("Student deleted");
    if ($("recordId").value === id) resetForm();
    await loadStudents();
  } catch (err) {
    toast(err.message, "error");
  }
}

function resetForm() {
  form.reset();
  $("recordId").value = "";
  $("formTitle").textContent = "Add Student";
  $("submitBtn").textContent = "Add Student";
  $("cancelBtn").hidden = true;
  fields.forEach((f) => $(f).classList.remove("invalid"));
}

// ---------- events ----------
form.addEventListener("submit", saveStudent);
$("cancelBtn").addEventListener("click", resetForm);
$("search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadStudents, 300);
});
$("tbody").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "edit") startEdit(btn.dataset.id);
  if (btn.dataset.action === "delete") deleteStudent(btn.dataset.id);
});

loadStudents();
