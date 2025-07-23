import { Map } from 'lucide-react';
import { Link } from 'react-router';

export default function Header() {
  return (
    <header className='w-full bg-gradient-to-r from-sky-600 to-sky-700 text-white shadow-xl border-b border-sky-500/20'>
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4'>
        <div className='flex items-center justify-between'>
          <Link to='/' className='flex items-center group'>
            <div className='p-2 bg-white/10 rounded-lg mr-3 group-hover:bg-white/20 transition-all duration-200'>
              <div className='relative cursor-pointer'>
                <img src='/river.png' alt='FloodStatus Logo' className='h-8 w-8' />
              </div>
            </div>
            <div className='flex flex-col cursor-pointer'>
              <span className='text-xl sm:text-2xl font-bold tracking-wider'>FloodStatus</span>
              <span className='text-sky-100 text-xs sm:text-sm font-medium'>실시간 하천 수위 모니터링</span>
            </div>
          </Link>

          <nav className='hidden md:flex items-center space-x-1'>
            <Link
              to='/'
              className='px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 transition-all duration-200 font-medium text-sm lg:text-base flex items-center space-x-2'
            >
              <Map className='h-4 w-4' />
              <span>지도</span>
            </Link>
            {/* <Link
              to='#'
              className='px-4 py-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition-all duration-200 font-medium text-sm lg:text-base flex items-center space-x-2'
            >
              <InfoIcon className='h-4 w-4' />
              <span>정보</span>
            </Link> */}
          </nav>

          {/* 모바일 메뉴 버튼 */}
          <button className='hidden md:hidden p-2 rounded-lg hover:bg-white/10 transition-colors duration-200'>
            <svg className='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 6h16M4 12h16M4 18h16' />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
