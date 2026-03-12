/** Error with separate title/description for toast notifications. */
export class ToastError extends Error {
  title: string;
  description: string;

  constructor(title: string, description: string) {
    super(`${title}: ${description}`);
    this.name = 'ToastError';
    this.title = title;
    this.description = description;
  }
}
