/** Common IANA timezones for the admin dropdown. */
export const TIMEZONE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "Europe/Kyiv", label: "Europe/Kyiv (Україна)" },
  { value: "Europe/Warsaw", label: "Europe/Warsaw (Польща)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (Німеччина)" },
  { value: "Europe/Prague", label: "Europe/Prague (Чехія)" },
  { value: "Europe/Bucharest", label: "Europe/Bucharest (Румунія)" },
  { value: "Europe/Chisinau", label: "Europe/Chisinau (Молдова)" },
  { value: "Europe/Vilnius", label: "Europe/Vilnius (Литва)" },
  { value: "Europe/Riga", label: "Europe/Riga (Латвія)" },
  { value: "Europe/Tallinn", label: "Europe/Tallinn (Естонія)" },
  { value: "Europe/Moscow", label: "Europe/Moscow" },
  { value: "Europe/London", label: "Europe/London (UK)" },
  { value: "Europe/Paris", label: "Europe/Paris (Франція)" },
  { value: "Europe/Madrid", label: "Europe/Madrid (Іспанія)" },
  { value: "Europe/Rome", label: "Europe/Rome (Італія)" },
  { value: "Europe/Athens", label: "Europe/Athens (Греція)" },
  { value: "Europe/Istanbul", label: "Europe/Istanbul (Туреччина)" },
  { value: "Asia/Tbilisi", label: "Asia/Tbilisi (Грузія)" },
  { value: "Asia/Almaty", label: "Asia/Almaty (Казахстан)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (ОАЕ)" },
  { value: "Asia/Jerusalem", label: "Asia/Jerusalem (Ізраїль)" },
  { value: "America/New_York", label: "America/New_York (USA East)" },
  { value: "America/Chicago", label: "America/Chicago (USA Central)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (USA West)" },
  { value: "America/Toronto", label: "America/Toronto (Канада)" },
  { value: "UTC", label: "UTC" },
];

export function timezoneSelectHtml(selected: string): string {
  const values = new Set(TIMEZONE_OPTIONS.map((item) => item.value));
  const options = [...TIMEZONE_OPTIONS];
  if (selected && !values.has(selected)) {
    options.unshift({ value: selected, label: `${selected} (поточний)` });
  }
  return options
    .map((item) => {
      const isSelected = item.value === selected ? " selected" : "";
      return `<option value="${item.value}"${isSelected}>${item.label}</option>`;
    })
    .join("");
}
