import { Link } from 'react-router-dom'

function NotFoundPage() {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-bold">페이지를 찾을 수 없습니다</h1>
      <p className="text-slate-500">요청하신 주소가 잘못되었거나 존재하지 않습니다.</p>
      <Link to="/" className="font-medium text-blue-600 hover:underline">
        홈으로 이동
      </Link>
    </div>
  )
}

export default NotFoundPage
