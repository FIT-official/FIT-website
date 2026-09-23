export class ModelImportError extends Error {
  constructor(code, message, status = 422) {
    super(message)
    this.name = 'ModelImportError'
    this.code = code
    this.status = status
  }
}

export const UPLOAD_HELP = 'Download the model from its source, then upload an STL, OBJ or 3MF file (up to 25 MB).'

export function importError(code, message, status) {
  return new ModelImportError(code, message, status)
}
