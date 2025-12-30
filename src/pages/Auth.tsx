import { AuthForm } from '@/components/chat/AuthForm';
import { useAuth } from '@/hooks/useAuth';

export const Auth = () => {
  const { signUp, signIn } = useAuth();

  return <AuthForm onSignUp={signUp} onSignIn={signIn} />;
};
