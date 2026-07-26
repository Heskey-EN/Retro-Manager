// PDF form reading + filling via pdf-lib (loaded on demand so it stays out of
// the initial bundle). "Fields" are AcroForm form fields — a template must have
// them to be filled, and a source PDF must have them for its values to be read.

async function loadLib() {
  return import('pdf-lib')
}

async function loadDoc(blob) {
  const { PDFDocument } = await loadLib()
  const bytes = blob instanceof ArrayBuffer ? blob : await blob.arrayBuffer()
  return PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
}

// List a PDF's form fields (name + kind). Empty array = not a fillable form.
export async function readFields(blob) {
  const pdf = await loadDoc(blob)
  const form = pdf.getForm()
  return form.getFields().map((f) => ({
    name: f.getName(),
    kind: f.constructor.name.replace(/^PDF/, ''),
  }))
}

// Read current values keyed by field name (for source PDFs).
export async function readFieldValues(blob) {
  const pdf = await loadDoc(blob)
  const form = pdf.getForm()
  const out = {}
  for (const f of form.getFields()) {
    const name = f.getName()
    let value = ''
    try {
      if (typeof f.getText === 'function') value = f.getText() || ''
      else if (typeof f.isChecked === 'function') value = f.isChecked() ? 'Yes' : ''
      else if (typeof f.getSelected === 'function') value = (f.getSelected() || []).join(', ')
    } catch {
      value = ''
    }
    out[name] = value
  }
  return out
}

// Fill a template's fields from { fieldName: value } and return a new PDF blob.
// Returns which mapped fields weren't found so the UI can flag mismatches.
export async function fillTemplate(templateBlob, values) {
  const pdf = await loadDoc(templateBlob)
  const form = pdf.getForm()
  const known = new Set(form.getFields().map((f) => f.getName()))
  const missing = []

  for (const [name, raw] of Object.entries(values)) {
    if (raw == null || raw === '') continue
    if (!known.has(name)) { missing.push(name); continue }
    const val = String(raw)
    try {
      const field = form.getField(name)
      const kind = field.constructor.name
      if (kind.includes('TextField')) field.setText(val)
      else if (kind.includes('CheckBox')) {
        const yes = ['yes', 'true', '1', 'x', 'on'].includes(val.toLowerCase())
        yes ? field.check() : field.uncheck()
      } else if (kind.includes('Dropdown') || kind.includes('OptionList') || kind.includes('RadioGroup')) {
        try { field.select(val) } catch { /* value not an option */ }
      } else if (typeof field.setText === 'function') {
        field.setText(val)
      }
    } catch {
      missing.push(name)
    }
  }

  try { form.updateFieldAppearances() } catch { /* best effort */ }
  const bytes = await pdf.save()
  return { blob: new Blob([bytes], { type: 'application/pdf' }), missing }
}
