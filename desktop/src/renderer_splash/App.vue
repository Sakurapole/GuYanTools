<template>
  <div class="splash-wrapper">
    <div class="splash-container">
      <div class="logo-container" ref="logoContainer">
        <div class="app-logo">
          <span class="app-logo-text">GuYan</span>
          <span class="app-logo-text second">Tools</span>
        </div>
      </div>
      <div class="app-info">
        <h1 class="app-name">故燕南离</h1>
        <p class="app-version">v{{ appVersion }}</p>
        <p class="app-copyright">© {{ currentYear }} laityh</p>
      </div>
      <div class="loading-bar">
        <div class="loading-progress" ref="progressBar"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { gsap } from 'gsap';

const appVersion = '1.0.0';
const currentYear = new Date().getFullYear();

const logoContainer = ref<HTMLElement | null>(null);
const progressBar = ref<HTMLElement | null>(null);

onMounted(() => {
  const tl = gsap.timeline();

  // 动画序列
  tl.fromTo(logoContainer.value,
    { opacity: 0, scale: 0.5 },
    { opacity: 1, scale: 1, duration: 0.8, ease: "back.out" }
  );

  tl.fromTo(".app-info",
    { opacity: 0, y: 20 },
    { opacity: 1, y: 0, duration: 0.5 }
  );

  tl.fromTo(progressBar.value,
    { scaleX: 0 },
    { scaleX: 1, duration: 1, ease: "power1.inOut" }
  );

  // 通知主进程准备就绪
  setTimeout(() => {
    window.ipcRenderer?.send('splash-animation-finished');
  }, 2500);
});
</script>

<style>
/* 全局样式 - 确保整个页面透明 */
html, body {
  margin: 0;
  padding: 0;
  background: transparent !important;
  overflow: hidden;
}

#splash-app {
  background: transparent;
}
</style>

<style scoped>
/* 外层包装器 - 透明背景，占满整个窗口 */
.splash-wrapper {
  width: 100vw;
  height: 100vh;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
}

/* 内容容器 - 有背景色，居中显示 */
.splash-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: #1e1e2e;
  color: #ffffff;
  border-radius: 12px;
  padding: 30px 40px;
  box-sizing: border-box;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  min-width: 320px;
  max-width: 400px;
}

.logo-container {
  margin-bottom: 20px;
}

.app-logo {
  font-size: 48px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-logo-text {
  color: #61dafb;
}

.app-logo-text.second {
  color: #f06292;
  margin-left: 5px;
}

.app-info {
  text-align: center;
  margin-bottom: 30px;
}

.app-name {
  font-size: 24px;
  margin-bottom: 5px;
}

.app-version {
  font-size: 14px;
  opacity: 0.8;
  margin-bottom: 5px;
}

.app-copyright {
  font-size: 12px;
  opacity: 0.6;
}

.loading-bar {
  width: 80%;
  height: 4px;
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.loading-progress {
  height: 100%;
  background: linear-gradient(90deg, #61dafb, #f06292);
  transform-origin: left center;
}
</style> 