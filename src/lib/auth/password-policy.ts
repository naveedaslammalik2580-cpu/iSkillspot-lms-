// Shared browser/server policy; bcrypt accepts at most 72 UTF-8 bytes.
export function passwordMeetsPolicy(value: string): boolean {
  return (
    value.length >= 12 &&
    new TextEncoder().encode(value).length <= 72 &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[^a-zA-Z0-9]/.test(value) &&
    !/(password|qwerty|letmein|welcome|admin|iskillspot|123456|abcdef)/i.test(
      value,
    ) &&
    !/(.)\1{4}/.test(value)
  );
}
