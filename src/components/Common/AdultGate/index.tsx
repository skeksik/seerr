import useAdult from '@app/hooks/useAdult';
import ErrorPage from '@app/pages/_error';

// Adult pages fetch as soon as they mount, so they only mount for users who
// may see adult content; everyone else gets the 404 the API would imply
const withAdultGate = <P extends object>(
  Component: React.ComponentType<P>
): React.FC<P> => {
  const AdultGate = (props: P) => {
    const canViewAdult = useAdult();

    if (!canViewAdult) {
      return <ErrorPage statusCode={404} />;
    }

    return <Component {...props} />;
  };

  AdultGate.displayName = `withAdultGate(${
    Component.displayName ?? Component.name
  })`;

  return AdultGate;
};

export default withAdultGate;
