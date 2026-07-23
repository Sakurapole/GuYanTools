import React from 'react';
import { createRoot } from 'react-dom/client';
import '@guyantools/plugin-ui/tokens.css';
import '@guyantools/plugin-ui/react';
import './custom-elements.d.ts';

function App() { return <main><gt-card><h1>GuYanTools Plugin</h1><gt-input placeholder="Try the shared input" /><gt-button variant="primary">Run</gt-button></gt-card></main>; }
createRoot(document.getElementById('root')!).render(<App />);
void window.pluginAPI?.logger.info('React plugin loaded');
