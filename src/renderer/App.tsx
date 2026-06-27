import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import TopBar from './components/layout/TopBar'
import Sidebar from './components/layout/Sidebar'
import RightPanel from './components/layout/RightPanel'
import ModpackModal from './components/modpack/ModpackModal'
import CreateModpackModal from './components/modpack/CreateModpackModal'
import SettingsModal from './components/settings/SettingsModal'
import CustomThemeModal from './components/settings/CustomThemeModal'
import ProjectModal from './components/discover/ProjectModal'
import Home from './pages/Home'
import Discover from './pages/Discover'
import { useModalStore } from './store/modalStore'
import { useAuthStore } from './store/authStore'
import { useModpackStore } from './store/modpackStore'
import { useUpdateStore } from './store/updateStore'
import styles from './App.module.css'

export default function App(): JSX.Element {
  const openModpackId = useModalStore((s) => s.openModpackId)
  const isCreateOpen = useModalStore((s) => s.isCreateOpen)
  const isSettingsOpen = useModalStore((s) => s.isSettingsOpen)
  const isCustomThemeOpen = useModalStore((s) => s.isCustomThemeOpen)
  const discoverResult = useModalStore((s) => s.discoverResult)
  const initAuth = useAuthStore((s) => s.init)
  const loadModpacks = useModpackStore((s) => s.load)
  const startEventSubscriptions = useModpackStore((s) => s.startEventSubscriptions)

  useEffect(() => {
    startEventSubscriptions()
    void initAuth()
    void loadModpacks()

    const setAvailable = useUpdateStore.getState().setAvailable
    const setProgress = useUpdateStore.getState().setProgress
    const offAvailable = window.api.updater.onAvailable((info) => setAvailable(info.version))
    const offProgress = window.api.updater.onProgress((info) => setProgress(info.percent))
    return () => {
      offAvailable()
      offProgress()
    }
  }, [initAuth, loadModpacks, startEventSubscriptions])

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
        {isCreateOpen && <CreateModpackModal />}
        {isSettingsOpen && <SettingsModal />}
        {isCustomThemeOpen && <CustomThemeModal />}
        {discoverResult !== null && (
          <ProjectModal key={discoverResult.id} result={discoverResult} />
        )}
      </div>
    </HashRouter>
  )
}
