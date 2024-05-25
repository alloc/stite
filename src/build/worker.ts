import { workerData } from 'worker_threads'
import { loadPageFactory } from './pageFactory.js'

export interface BuildWorker {
  renderPage(pageUrl: string): Promise<void> | void
  destroy?: () => Promise<void>
}

export default loadPageFactory(workerData)
