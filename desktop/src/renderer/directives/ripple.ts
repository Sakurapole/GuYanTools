import { Directive } from 'vue';

const ripple: Directive = {
  mounted(el: HTMLElement) {
    // 保证相对定位和隐藏溢出
    if (getComputedStyle(el).position === 'static') {
      el.style.position = 'relative';
    }
    el.style.overflow = 'hidden';

    const clickHandler = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const ripple = document.createElement('span');

      // 水波纹初始尺寸和位置，我们让波纹的直径是元素对角线长度，保证铺满
      const diameter = Math.sqrt(rect.width ** 2 + rect.height ** 2);
      const radius = diameter / 2;

      ripple.style.width = ripple.style.height = `${diameter}px`;
      ripple.style.position = 'absolute';
      ripple.style.borderRadius = '50%';
      ripple.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
      ripple.style.pointerEvents = 'none';
      ripple.style.left = `${e.clientX - rect.left - radius}px`;
      ripple.style.top = `${e.clientY - rect.top - radius}px`;
      
      ripple.style.transform = 'scale(0)';
      ripple.style.opacity = '0.6';
      ripple.style.transition = 'transform 0.6s ease, opacity 1s ease';

      el.appendChild(ripple);

      // 触发动画
      requestAnimationFrame(() => {
        ripple.style.transform = 'scale(1)';
        ripple.style.opacity = '0';
      });

      // 动画结束移除
      const cleanup = () => {
        ripple.remove();
        ripple.removeEventListener('transitionend', cleanup);
      };
      ripple.addEventListener('transitionend', cleanup);
    };

    el.addEventListener('click', clickHandler);

    (el as any)._rippleCleanup = () => {
      el.removeEventListener('click', clickHandler);
    };
  },
  unmounted(el: HTMLElement) {
    if ((el as any)._rippleCleanup) {
      (el as any)._rippleCleanup();
      delete (el as any)._rippleCleanup;
    }
  }
};

export default ripple;
