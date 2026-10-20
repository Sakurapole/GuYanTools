import React from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return (
    <main>
      <h1>GuYanTools Plugin</h1>
      <p>React plugin is ready.</p>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
void window.pluginAPI?.logger.info('React plugin loaded');
