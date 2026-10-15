import NetworkStudioList from '@app/components/Scenes/NetworkStudioList';
import type { NextPage } from 'next';

const NetworkStudiosPage: NextPage = () => (
  <NetworkStudioList source="stashdb" />
);

export default NetworkStudiosPage;
