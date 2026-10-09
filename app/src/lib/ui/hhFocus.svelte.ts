/* Sprung zur Anfahrt einer Familie (#243): Households klappt sie auf, scrollt hin und lässt sie aufleuchten */
export const hhFocus = $state<{ name: string | null; n: number }>({ name: null, n: 0 });

export function focusHousehold(name: string) {
  hhFocus.name = name;
  hhFocus.n++;
}
