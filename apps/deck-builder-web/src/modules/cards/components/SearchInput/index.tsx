import clsx from 'clsx';
import { debounce } from 'throttle-debounce';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface IProps {
  className?: string;
}

const SearchInput: React.FC<IProps> = ({ className }) => {
  const searchParams = useSearchParams();
  const router = useRouter();

  const inputValue = searchParams.get('q') || '';

  const handleChange = debounce(1000, (e: React.ChangeEvent<HTMLInputElement>) => {
    router.replace(`/cards?q=${e.target.value}`)
  })

  return (
    <div className={clsx(className)}>
      <input
        type="text"
        defaultValue={inputValue}
        placeholder='Search a card by name'
        className='px-4 py-2 border-2 border-blue-400 w-full'
        onChange={handleChange} />
    </div>
  )
}

export default SearchInput;