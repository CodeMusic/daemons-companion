// C-37, C-38: the device's colours for the day. The week DAEMONS exports gives each day the CHECKPOINT's trim, which is
// the game's -- a dark red on Sunday that reads as brown behind a menu. The handheld takes a rainbow week instead
// (RoverRadio's: red, orange, yellow, green, blue, indigo, violet, Sunday first): `menu`, softened to sit behind
// text, and `led`, the pure hue the ring of lights dims to a third.
const DAYS: Record<string, { menu: string; led: string }> = {
  Sunday:    { menu: "#B8443E", led: "#FF0000" },
  Monday:    { menu: "#C9702E", led: "#FF5A00" },
  Tuesday:   { menu: "#CFAE34", led: "#FFC800" },
  Wednesday: { menu: "#3F9A55", led: "#00FF20" },
  Thursday:  { menu: "#3474B0", led: "#0050FF" },
  Friday:    { menu: "#4D4BAE", led: "#2800FF" },
  Saturday:  { menu: "#8A4CAE", led: "#B000FF" },
};

export const deviceDay = (day: string) => DAYS[day] ?? { menu: "#5B6B8C", led: "#4060FF" };
