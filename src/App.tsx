import { Helmet } from 'react-helmet';
import FloodMap from './components/FloodMap';

function App() {
  return (
    <>
      <Helmet>
        <title>서울시 하천 수위 상황판</title>
        <meta property='og:title' content='서울시 하천 수위 상황판' />
        <meta charSet='utf-8' />
        <link rel='canonical' href='https://floodstatus.vercel.app/' />
      </Helmet>
      <FloodMap />
    </>
  );
}

export default App;
