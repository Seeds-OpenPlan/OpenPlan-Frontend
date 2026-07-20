import { Link } from 'react-router-dom'

function NotFoundPage() {
  return (
    <main>
      <h1>페이지를 찾을 수 없습니다</h1>
      <p>요청하신 주소가 잘못되었거나 존재하지 않습니다.</p>
      <Link to="/">홈으로 이동</Link>
    </main>
  )
}

export default NotFoundPage
