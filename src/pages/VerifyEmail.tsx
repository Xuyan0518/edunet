import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

const VerifyEmail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [verificationStatus, setVerificationStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setVerificationStatus('error');
      setMessage('No verification token provided');
      return;
    }

    verifyEmail(token);
  }, [searchParams]);

  const verifyEmail = async (token: string) => {
    try {
      const response = await fetch(buildApiUrl(`verify-email/${token}`));
      const data = await response.json();

      if (response.ok) {
        setVerificationStatus('success');
        setMessage(data.message);
      } else {
        setVerificationStatus('error');
        setMessage(data.error || 'Verification failed');
      }
    } catch (error) {
      setVerificationStatus('error');
      setMessage('Network error. Please try again.');
    }
  };

  const handleLogin = () => {
    navigate('/login');
  };

  const handleResend = () => {
    // TODO: Implement resend verification email functionality
    toast({
      title: "Resend functionality",
      description: "This feature will be implemented soon.",
    });
  };

  const renderContent = () => {
    switch (verificationStatus) {
      case 'verifying':
        return (
          <div className="text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-500" />
            <h3 className="text-lg font-semibold">Verifying your email...</h3>
            <p className="text-muted-foreground">Please wait while we verify your email address.</p>
          </div>
        );

      case 'success':
        return (
          <div className="text-center space-y-4">
            <CheckCircle className="h-16 w-16 mx-auto text-green-500" />
            <h3 className="text-xl font-semibold text-green-700">Email Verified!</h3>
            <p className="text-muted-foreground">{message}</p>
            <div className="space-y-2">
              <Button onClick={handleLogin} className="w-full">
                Continue to Login
              </Button>
            </div>
          </div>
        );

      case 'error':
        return (
          <div className="text-center space-y-4">
            <XCircle className="h-16 w-16 mx-auto text-red-500" />
            <h3 className="text-xl font-semibold text-red-700">Verification Failed</h3>
            <p className="text-muted-foreground">{message}</p>
            <div className="space-y-2">
              <Button onClick={handleResend} variant="outline" className="w-full">
                Resend Verification Email
              </Button>
              <Button onClick={handleLogin} variant="ghost" className="w-full">
                Go to Login
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl text-center">Email Verification</CardTitle>
          </CardHeader>
          <CardContent>
            {renderContent()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default VerifyEmail;
