import AdultRequestModal from '@app/components/RequestModal/AdultRequestModal';
import type { MediaStatus } from '@server/constants/media';

// The old props, kept until SceneDetails and AdultMovieDetails use
// RequestModal with type 'scene' or 'adultmovie'. The modal loads title and
// artwork itself, so only mediaType and id are still read.
export interface AdultRequestItem {
  mediaType: 'scene' | 'adultmovie';
  // StashDB scene id or ThePornDB movie id
  id: string;
  title?: string;
  backdrop?: string;
  backdropType?: 'stashdb' | 'tpdb';
}

interface SceneRequestModalProps {
  item: AdultRequestItem;
  onCancel: () => void;
  onComplete: (newStatus: MediaStatus) => void;
}

const SceneRequestModal = ({
  item,
  onCancel,
  onComplete,
}: SceneRequestModalProps) => (
  <AdultRequestModal
    type={item.mediaType}
    id={item.id}
    onCancel={onCancel}
    onComplete={onComplete}
  />
);

export default SceneRequestModal;
