import SceneDetails from '@app/components/SceneDetails';
import { getHostAndPort } from '@app/utils/urlHelper';
import type { SceneDetails as SceneDetailsType } from '@server/models/Scene';
import axios from 'axios';
import type { GetServerSideProps, NextPage } from 'next';

interface ScenePageProps {
  scene?: SceneDetailsType;
}

const ScenePage: NextPage<ScenePageProps> = ({ scene }) => {
  return <SceneDetails scene={scene} />;
};

export const getServerSideProps: GetServerSideProps<ScenePageProps> = async (
  ctx
) => {
  // Users without adult access get a 403 here; the page shows its own 404
  const response = await axios
    .get<SceneDetailsType>(
      `http://${getHostAndPort()}/api/v1/scene/${ctx.query.sceneId}`,
      {
        headers: ctx.req?.headers?.cookie
          ? { cookie: ctx.req.headers.cookie }
          : undefined,
      }
    )
    .catch(() => undefined);

  return {
    props: response ? { scene: response.data } : {},
  };
};

export default ScenePage;
