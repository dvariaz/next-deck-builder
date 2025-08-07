interface IProps {
  value?: number;
  onIncrement?: () => void;
  onDecrement?: () => void;
}

const Counter: React.FC<IProps> = ({ value = 0, onIncrement, onDecrement }) => {
  return (
    <div className='bg-slate-700 rounded-lg flex items-center'>
      <button onClick={onDecrement} className='px-2 hover:bg-white/10'>-</button>
      <span className='flex-1 text-center'>{value}</span>
      <button onClick={onIncrement} className='px-2 hover:bg-white/10'>+</button>
    </div>
  )
}

export default Counter;