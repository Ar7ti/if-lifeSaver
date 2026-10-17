/** Keep synchronous planning/search responsive on GPT-6's reasoning models.
 * Earlier model families keep their existing API defaults and compatibility. */
export function interactiveModelOptions(model: string) {
  return /^gpt-6(?:[.-]|$)/.test(model) ? {reasoning:{effort:'low' as const}} : {};
}
