import { Link } from 'react-router-dom'
import ClassroomStory from '../components/ClassroomStory'
import './LandingPage.css'

export default function LandingPage() {
  return (
    <main className="npc-landing">
      <header className="npc-nav">
        <Link to="/" className="npc-brand" aria-label="NPC home">
          <img src="/favicon.svg" alt="NPC — No Phones, Class" />
        </Link>
        <div className="npc-nav-right">
          <Link to="/login" className="npc-nav-login">Login <span aria-hidden="true">↗</span></Link>
        </div>
      </header>
      <ClassroomStory />
    </main>
  )
}
