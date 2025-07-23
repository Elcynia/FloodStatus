import { Mail, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router';
export default function Footer() {
  const CURRENT_YEAR = new Date().getFullYear();

  return (
    <footer className='relative max-w-[1350px] w-full mx-auto py-8 lg:py-12'>
      {/* 면책사항 */}
      <div className='border-gray-200'>
        <div className='bg-gray-50 border border-gray-200 rounded-lg p-6'>
          <div className='flex items-start space-x-4'>
            <div className='p-2 bg-gray-200 rounded-lg mt-1'>
              <AlertTriangle className='h-4 w-4 text-gray-600' />
            </div>
            <div>
              <h5 className='text-gray-700 font-semibold text-base mb-3 flex items-center space-x-2'>
                <span>면책사항</span>
              </h5>
              <p className='text-gray-600 text-sm leading-relaxed'>
                이 서비스는 공공의 안전을 위한 <span className='font-semibold text-gray-800'>참고용 정보</span>를
                제공합니다. 정확한 재해 정보 및 대피 명령은{' '}
                <span className='font-semibold text-gray-800'>기상청, 관련 공공기관</span>의 공식 발표를 우선하여
                참고하시기 바랍니다.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className='border-t border-gray-200 pt-8'>
        <div className='flex flex-col md:flex-row justify-between items-center space-y-6 md:space-y-0'>
          {/* Copyright */}
          <div className='text-center md:text-left'>
            <p className='text-gray-700 text-sm font-medium'>© {CURRENT_YEAR} FloodStatus. All rights reserved.</p>
            <p className='text-gray-500 text-xs mt-2 flex items-center justify-center md:justify-start space-x-1'>
              <span>Made by</span>
              <span className='text-red-500'>❤️</span>
              <span>Elcynia</span>
            </p>
          </div>

          {/* 개발자 문의 섹션 */}
          <div className='bg-gray-50 border border-gray-200 rounded-lg px-4 py-2'>
            <div className='flex items-center space-x-4'>
              <div className='p-2 bg-gray-200 rounded-lg'>
                <Mail className='h-4 w-4 text-gray-600' />
              </div>
              <div>
                <span className='text-gray-700 font-bold text-sm block mb-1'>문의 & 기능개선 요청</span>
                <p className='text-blue-500 font-bold text-sm'>elysiabyss@gmail.com</p>
              </div>
            </div>
          </div>

          {/* 커피 후원 */}
          <div>
            <a href='https://www.buymeacoffee.com/elcynia' target='_blank' rel='noopener noreferrer'>
              <img
                src='https://img.buymeacoffee.com/button-api/?text=커피 한 잔 후원하기&emoji=☕&slug=elcynia&button_colour=FFDD00&font_colour=000000&font_family=Poppins&outline_colour=000000&coffee_colour=ffffff'
                alt='Buy Me A Coffee'
              />
            </a>
          </div>

          {/* 버전 */}
          <div className='flex items-center space-x-4'>
            <div className='px-4 py-3.5 bg-gray-800 text-white rounded-lg text-sm font-medium'>
              <span className='flex items-center space-x-2'>
                <span>v1.0.0</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
