import { HashRouter, Route, Routes } from 'react-router-dom'
import TopBar from './components/layout/TopBar'
import Sidebar from './components/layout/Sidebar'
import RightPanel from './components/layout/RightPanel'
import ModpackModal from './components/modpack/ModpackModal'
import Home from './pages/Home'
import Discover from './pages/Discover'
import { useModalStore } from './store/modalStore'
import styles from './App.module.css'

export default function App(): JSX.Element {
  const openModpackId = useModalStore((s) => s.openModpackId)

  return (
    <HashRouter>
      <div className={styles.app}>
        <TopBar />
        <div className={styles.body}>
          <Sidebar />
          <main className={styles.content}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/discover" element={<Discover />} />
            </Routes>
          </main>
          <RightPanel />
        </div>
        {openModpackId !== null && <ModpackModal modpackId={openModpackId} />}
      </div>
    </HashRouter>
  )
}
