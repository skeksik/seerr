import { LANDSCAPE_CARD_WIDTH } from '@app/components/TitleCard/constants';

interface PlaceholderProps {
  canExpand?: boolean;
  // Shaped like a scene card instead of a poster
  landscape?: boolean;
  // Grows on hover like the card it stands in for, though it leads nowhere
  hoverable?: boolean;
}

const Placeholder = ({
  canExpand = false,
  landscape = false,
  hoverable = false,
}: PlaceholderProps) => {
  return (
    <div
      className={`relative animate-pulse rounded-xl bg-gray-700 ${
        hoverable
          ? 'transform-gpu cursor-pointer ring-1 ring-gray-700 transition duration-150 ease-in-out hover:scale-105 hover:ring-gray-500'
          : ''
      } ${
        canExpand
          ? 'w-full'
          : landscape
            ? LANDSCAPE_CARD_WIDTH
            : 'w-36 sm:w-36 md:w-44'
      }`}
    >
      <div
        className="w-full"
        style={{ paddingBottom: landscape ? '56.25%' : '150%' }}
      />
    </div>
  );
};

export default Placeholder;
