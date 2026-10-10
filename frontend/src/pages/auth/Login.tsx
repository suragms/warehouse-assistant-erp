import React, { useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import apiClient from '../../api/apiClient';
import { useAuthStore } from '../../stores/authStore';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { BrandLogo } from '../../components/BrandIdentity';
import loginBackgroundUrl from '../../../../brand/getstarted_bg.webp';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});
type LoginForm = z.infer<typeof loginSchema>;

export const Login: React.FC = () => {
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema)
  });

  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setSession = useAuthStore(s => s.setSession);
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';

  const onSubmit = async (data: LoginForm) => {
    try {
      setIsSubmitting(true);
      setApiError(null);
      const res = await apiClient.post('/auth/login', data);
      setSession(res.data.data.accessToken, res.data.data.user);
      navigate(from, { replace: true });
    } catch (err: any) {
      setApiError(err.normalized?.message || 'Failed to login');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative isolate min-h-screen min-h-[100svh] bg-[#F7F9F6] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div aria-hidden="true" data-testid="login-background" className="absolute inset-0 -z-10 bg-cover bg-[center_65%] lg:right-1/2"
        style={{ backgroundImage: `url(${loginBackgroundUrl})` }}>
        <div className="absolute inset-0 bg-[#F7F9F6]/90 lg:hidden" />
      </div>
      <div className="w-full lg:w-1/2 lg:ml-auto">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center">
            <BrandLogo className="h-12 w-auto" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-[#0F172A]">
            Warehouse Assistant
          </h2>
          <p className="mt-2 text-center text-lg text-[#475569]">
            Harisree Agency
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-[#E2E8E6]">
            {apiError && (
              <div className="mb-4 rounded-md bg-red-50 p-4">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">{apiError}</h3>
                  </div>
                </div>
              </div>
            )}

            <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-[#0F172A]">Email address</label>
                <div className="mt-1">
                  <input
                    {...register('email')}
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    className="appearance-none block w-full px-3 py-2 border border-[#E2E8E6] rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-[#159A8A] focus:border-[#159A8A] sm:text-sm"
                  />
                  {errors.email && <p className="mt-2 text-sm text-red-600">{errors.email.message}</p>}
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="block text-sm font-medium text-[#0F172A]">Password</label>
                <div className="mt-1">
                  <input
                    {...register('password')}
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    className="appearance-none block w-full px-3 py-2 border border-[#E2E8E6] rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-[#159A8A] focus:border-[#159A8A] sm:text-sm"
                  />
                  {errors.password && <p className="mt-2 text-sm text-red-600">{errors.password.message}</p>}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <p className="text-[#475569]">For sign-in help, contact your business owner.</p>
                  <Link to="/forgot-password" className="inline-block py-2 underline text-[#0E4F46]">Forgot password?</Link>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#0E4F46] hover:bg-[#065F4F] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#159A8A] disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="animate-spin h-5 w-5" /> : 'Sign in'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
export default Login;
