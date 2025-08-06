import './css/App.css'
import { Connection } from './features/valkeyconnection/valkeyConnection'
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { setConnecting } from './features/wsconnection/wsConnectionSlice';

function App() {
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(setConnecting(true))
  }, [dispatch])

  return (
    <>
      <h1>Valkey Boilerplate</h1>
      <Connection/>
    </>
  )
}

export default App
