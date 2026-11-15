import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { EmptyState, Button } from '../components/ui';

export default function NotFound() {
  const { user } = useAuth();
  const home = !user ? '/login' : user.role === 'admin' ? '/admin' : '/student';
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={<Compass className="size-6" />}
        title="Page not found"
        description="The page you are looking for does not exist or has moved."
        action={<Link to={home}><Button>Go to dashboard</Button></Link>}
      />
    </div>
  );
}
