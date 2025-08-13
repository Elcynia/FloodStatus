import { Helmet } from 'react-helmet';
import FloodMap from './components/FloodMap';

function App() {
  return (
    <>
      <Helmet>
        <meta charSet='utf-8' />
        <title>하천 수위 상황판</title>
        <link rel='canonical' href='https://floodstatus.vercel.app/' />
      </Helmet>
      <FloodMap />
    </>
  );
}

export default App;
