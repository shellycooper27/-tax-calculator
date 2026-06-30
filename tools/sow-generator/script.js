(function () {
  const TEMPLATE_URL = "template/SoW-Template.docx";

  const FIELDS = [
    { id: "sowNumber", key: "sow_number", label: "SoW Number", required: true },
    { id: "sowDate", key: "sow_date", label: "SoW Date", required: true },
    { id: "resourceName", key: "resource_name", label: "Resource Name", required: true },
    { id: "msaEffectiveDate", key: "msa_effective_date", label: "MSA Effective Date", required: true },
    { id: "monthlyFee", key: "monthly_fee", label: "Monthly Fee", required: true },
    { id: "role", key: "role", label: "Role", required: true },
    { id: "sowEndDate", key: "sow_end_date", label: "SOW End Date", required: false },
  ];

  const DEFAULT_SOW_END_DATE = "As mutually agreed upon by the parties";

  const form = document.getElementById("sowForm");
  const generateBtn = document.getElementById("generateBtn");

  function clearFieldError(input) {
    input.classList.remove("field-invalid");
    const next = input.parentElement.querySelector(".field-error");
    if (next) next.remove();
  }

  function setFieldError(input, message) {
    input.classList.add("field-invalid");
    let next = input.parentElement.querySelector(".field-error");
    if (!next) {
      next = document.createElement("div");
      next.className = "field-error";
      input.parentElement.appendChild(next);
    }
    next.textContent = message;
  }

  function validate() {
    let valid = true;
    const data = {};
    FIELDS.forEach(function (f) {
      const input = document.getElementById(f.id);
      clearFieldError(input);
      const value = input.value.trim();
      if (f.required && !value) {
        setFieldError(input, f.label + " is required.");
        valid = false;
        return;
      }
      data[f.key] = value || (f.key === "sow_end_date" ? DEFAULT_SOW_END_DATE : "");
    });
    return valid ? data : null;
  }

  async function loadTemplate() {
    const response = await fetch(TEMPLATE_URL);
    if (!response.ok) {
      throw new Error("Could not load the SOW template (HTTP " + response.status + ").");
    }
    return response.arrayBuffer();
  }

  function fillTemplate(buffer, data) {
    const zip = new PizZip(buffer);
    const doc = new window.docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{{", end: "}}" },
    });
    doc.render(data);
    return doc.getZip().generate({
      type: "blob",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }

  function setLoading(isLoading) {
    generateBtn.disabled = isLoading;
    generateBtn.textContent = isLoading ? "Generating…" : "Generate SOW";
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const data = validate();
    if (!data) {
      showToast("Please fill in all required fields.", "error");
      return;
    }

    setLoading(true);
    try {
      const buffer = await loadTemplate();
      const blob = fillTemplate(buffer, data);
      const fileName = "SOW_" + (data.sow_number || "document").replace(/[^a-zA-Z0-9_-]+/g, "_") + ".docx";
      saveAs(blob, fileName);
      showToast("SOW generated successfully.", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to generate SOW: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  });
})();
