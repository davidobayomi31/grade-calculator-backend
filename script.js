// 🔗 Your backend URL on Render
const BACKEND_URL = "https://grade-calculator-backend.onrender.com";

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("backend-url-display").textContent = BACKEND_URL;

  // Global state
  let components = [];

  // --- Upload + extract ---
  const uploadForm = document.getElementById("uploadForm");
  const syllabusFileInput = document.getElementById("syllabusFile");
  const uploadStatus = document.getElementById("uploadStatus");

  uploadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = syllabusFileInput.files[0];
    if (!file) {
      uploadStatus.textContent = "Pick a syllabus file first.";
      uploadStatus.className = "status error";
      return;
    }

    uploadStatus.textContent = "Sending to backend...";
    uploadStatus.className = "status";

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${BACKEND_URL}/extract`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Backend error: ${res.status}`);
      }

      const data = await res.json();
      if (!data.components || !Array.isArray(data.components)) {
        throw new Error("Response does not contain components.");
      }

      // Normalize components
      components = data.components.map((c, idx) => ({
        id: c.id || `c-${idx}`,
        name: c.name || `Component ${idx + 1}`,
        weight: Number(c.weight) || 0,
        grade: "",
        isFinal: false,
      }));

      renderComponentsTable(components);
      uploadStatus.textContent = "Got grading breakdown from syllabus.";
      uploadStatus.className = "status success";
    } catch (err) {
      console.error(err);
      uploadStatus.textContent =
        "Could not parse syllabus. You can always enter/edit rows by hand.";
      uploadStatus.className = "status error";
    }
  });

  // --- Render table ---
  const tableBody = document.querySelector("#componentsTable tbody");
  const overallSoFar = document.getElementById("overallSoFar");

  function renderComponentsTable(list) {
    if (!list || list.length === 0) {
      tableBody.innerHTML =
        '<tr><td colspan="4">No components yet. Upload a syllabus or add rows manually.</td></tr>';
      overallSoFar.textContent = "";
      return;
    }

    tableBody.innerHTML = list
      .map(
        (c, idx) => `
      <tr data-id="${c.id}">
        <td>
          <input
            type="text"
            value="${escapeHtml(c.name)}"
            data-field="name"
          />
        </td>
        <td>
          <input
            type="number"
            min="0"
            max="200"
            step="0.1"
            value="${c.weight}"
            data-field="weight"
          />
        </td>
        <td>
          <input
            type="number"
            min="0"
            max="150"
            step="0.1"
            value="${c.grade ?? ""}"
            placeholder="e.g. 85"
            data-field="grade"
          />
        </td>
        <td>
          <input
            type="radio"
            name="finalComponent"
            ${c.isFinal ? "checked" : ""}
            data-field="isFinal"
            data-index="${idx}"
          />
        </td>
      </tr>
    `
      )
      .join("");

    // Hook up listeners
    tableBody.querySelectorAll("input").forEach((input) => {
      const field = input.dataset.field;
      if (!field) return;

      input.addEventListener("input", () => {
        syncComponentsFromDOM();
        updateOverall();
      });

      if (field === "isFinal") {
        input.addEventListener("change", () => {
          const idx = Number(input.dataset.index);
          components = components.map((c, i) => ({
            ...c,
            isFinal: i === idx,
          }));
          updateOverall();
        });
      }
    });

    updateOverall();
  }

  function syncComponentsFromDOM() {
    const rows = Array.from(tableBody.querySelectorAll("tr"));
    components = rows.map((row) => {
      const id = row.getAttribute("data-id");
      const nameInput = row.querySelector('input[data-field="name"]');
      const weightInput = row.querySelector('input[data-field="weight"]');
      const gradeInput = row.querySelector('input[data-field="grade"]');
      const finalInput = row.querySelector('input[data-field="isFinal"]');

      return {
        id,
        name: nameInput.value.trim() || "Component",
        weight: Number(weightInput.value) || 0,
        grade: gradeInput.value === "" ? "" : Number(gradeInput.value),
        isFinal: finalInput.checked,
      };
    });
  }

  function updateOverall() {
    const overall = calculateOverallSoFar(components);
    if (overall == null) {
      overallSoFar.textContent =
        "Enter some grades to see your current weighted average (based on completed components).";
      overallSoFar.className = "status";
      return;
    }
    overallSoFar.textContent = `Current weighted average (completed only): ${overall.toFixed(
      2
    )}%`;
    overallSoFar.className = "status success";
  }

  function calculateOverallSoFar(list) {
    let sum = 0;
    let weightSum = 0;

    list.forEach((c) => {
      if (c.grade !== "" && !isNaN(c.grade)) {
        sum += c.grade * c.weight;
        weightSum += c.weight;
      }
    });

    if (weightSum === 0) return null;
    return sum / weightSum;
  }

  // --- Target grade / final requirement ---
  const targetOverallInput = document.getElementById("targetOverall");
  const calcTargetBtn = document.getElementById("calcTargetBtn");
  const targetResult = document.getElementById("targetResult");

  calcTargetBtn.addEventListener("click", () => {
    syncComponentsFromDOM();

    const targetOverall = Number(targetOverallInput.value);
    if (!targetOverall || isNaN(targetOverall)) {
      targetResult.textContent = "Enter a target overall grade first.";
      targetResult.className = "status error";
      return;
    }

    const finalComp = components.find((c) => c.isFinal);
    if (!finalComp) {
      targetResult.textContent =
        "Mark one component as your Final / remaining component.";
      targetResult.className = "status error";
      return;
    }

    const { required, sumKnown, weightFinal } = calculateRequiredFinal(
      components,
      targetOverall
    );

    if (required == null) {
      targetResult.textContent =
        "Weights look off. Check that your syllabus weights are correct.";
      targetResult.className = "status error";
      return;
    }

    let msg = `To finish with ${targetOverall.toFixed(
      2
    )}%, you need about ${required.toFixed(2)}% on "${finalComp.name}" (weight ${weightFinal}%).`;

    if (required > 100) {
      msg += " This is above 100%, so that target is mathematically out of reach.";
    } else if (required < 0) {
      msg +=
        " This is below 0%, so you already have enough to reach that target.";
    }

    targetResult.textContent = msg;
    targetResult.className = "status success";
  });

  function calculateRequiredFinal(list, targetOverall) {
    const totalWeight = list.reduce((acc, c) => acc + c.weight, 0);
    if (!totalWeight || totalWeight <= 0) return { required: null };

    let sumKnown = 0;
    let weightFinal = 0;

    list.forEach((c) => {
      if (c.isFinal) {
        weightFinal += c.weight;
      } else if (c.grade !== "" && !isNaN(c.grade)) {
        sumKnown += c.grade * c.weight;
      }
    });

    if (!weightFinal) return { required: null };

    // Assume syllabus weights sum to 100
    const required =
      (targetOverall * totalWeight - sumKnown) / weightFinal;

    return { required, sumKnown, weightFinal };
  }

  // --- Saving per course (localStorage) ---
  const saveBtn = document.getElementById("saveCourseBtn");
  const loadBtn = document.getElementById("loadCourseBtn");
  const clearBtn = document.getElementById("clearCourseBtn");
  const courseNameInput = document.getElementById("courseName");

  saveBtn.addEventListener("click", () => {
    syncComponentsFromDOM();
    const name = courseNameInput.value.trim();
    if (!name) {
      alert("Type a course name before saving.");
      return;
    }
    if (!components || components.length === 0) {
      alert("No components to save yet.");
      return;
    }
    const key = storageKey(name);
    const payload = { components };
    localStorage.setItem(key, JSON.stringify(payload));
    alert(`Saved breakdown for "${name}".`);
  });

  loadBtn.addEventListener("click", () => {
    const name = courseNameInput.value.trim();
    if (!name) {
      alert("Type the course name you saved under.");
      return;
    }
    const key = storageKey(name);
    const raw = localStorage.getItem(key);
    if (!raw) {
      alert(`No saved data found for "${name}".`);
      return;
    }
    try {
      const payload = JSON.parse(raw);
      components = (payload.components || []).map((c, idx) => ({
        id: c.id || `c-${idx}`,
        name: c.name,
        weight: Number(c.weight) || 0,
        grade: c.grade === "" ? "" : Number(c.grade),
        isFinal: !!c.isFinal,
      }));
      renderComponentsTable(components);
      alert(`Loaded saved breakdown for "${name}".`);
    } catch (e) {
      console.error(e);
      alert("Saved data was corrupted.");
    }
  });

  clearBtn.addEventListener("click", () => {
    const name = courseNameInput.value.trim();
    if (!name) {
      alert("Type the course name whose data you want to clear.");
      return;
    }
    const key = storageKey(name);
    localStorage.removeItem(key);
    alert(`Cleared saved data for "${name}".`);
  });

  function storageKey(name) {
    return `gradeCalc_${name.toLowerCase()}`;
  }

  // Simple HTML escaping for names
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Start with an empty table
  renderComponentsTable(components);
});