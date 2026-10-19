'use client';
import dynamic from 'next/dynamic';

// The app reads window/localStorage on first render, so it runs in the browser only.
const App = dynamic(() => import('../src/App.jsx'), { ssr: false });

export default function Page() {
  return <App />;
}
