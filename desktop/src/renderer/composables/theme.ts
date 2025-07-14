import { useLocalStorage } from "@vueuse/core";
import { watchEffect } from "vue";

type Theme = "light" | "dark";

export const useTheme = () => {
  const theme = useLocalStorage<Theme>("theme", "light");

  const toggleTheme = (event?: MouseEvent) => {
    const newTheme = theme.value === "light" ? "dark" : "light";
    const willDark = newTheme === "dark";
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const transition = document.startViewTransition(() => {
      theme.value = newTheme;
    });

    const x = event?.clientX ?? window.innerWidth
    const y = event?.clientY ?? 0

    const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    void transition.ready.then(() => {
      const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`]
      document.documentElement.animate(
        {
          clipPath: willDark ? clipPath : [...clipPath].reverse(),
        },
        {
          duration: 500,
          easing: 'ease-in',
          pseudoElement: willDark ? '::view-transition-new(root)' : '::view-transition-old(root)',
        },
      )
    });

    watchEffect(() => {
      if (theme) {
        document.documentElement.classList.remove("light", "dark");
      }
      document.documentElement.classList.toggle(theme.value as string);
    });
  };

  return { theme, toggleTheme };

}