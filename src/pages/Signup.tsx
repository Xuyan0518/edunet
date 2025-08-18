import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';
import { CheckCircle, Mail } from 'lucide-react';

const Signup: React.FC = () => {
  const [role, setRole] = useState<'teacher' | 'parent'>('parent');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const endpoint =
      role === 'parent'
        ? buildApiUrl('parents')
        : buildApiUrl('teachers');

    console.log('Signup attempt:', { role, name, email, endpoint });

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      
      console.log('Signup response status:', res.status);
      const data = await res.json();
      console.log('Signup response data:', data);

      if (!res.ok) {
        toast({
          title: "Signup failed",
          description: data.error?.email?.[0] || "Could not create account",
          variant: "destructive",
        });
        return;
      }

      setIsSuccess(true);
      toast({
        title: "Signup successful",
        description: "Please check your email to verify your account.",
      });
    } catch (err) {
      console.error('Signup error:', err);
      toast({
        title: "Error",
        description: "Network error. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    navigate('/login');
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-center">Check Your Email</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                  <Mail className="w-8 h-8 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Verification Email Sent</h3>
                  <p className="text-muted-foreground mt-2">
                    We've sent a verification link to <strong>{email}</strong>
                  </p>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Next steps:</strong>
                  </p>
                  <ol className="text-sm text-blue-700 mt-2 space-y-1 list-decimal list-inside">
                    <li>Check your email inbox</li>
                    <li>Click the verification link</li>
                    <li>Return here to log in</li>
                  </ol>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-2">
              <Button onClick={handleBackToLogin} className="w-full">
                Back to Login
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Didn't receive the email? Check your spam folder or contact support.
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl text-center">Sign Up</CardTitle>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div>
                <Label>I am a</Label>
                <RadioGroup value={role} onValueChange={v => setRole(v as 'teacher' | 'parent')} className="flex space-x-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="parent" id="parent" />
                    <Label htmlFor="parent" className="cursor-pointer">Parent</Label>
                  </div>
                  <div className="flex items-center justify-center space-x-2">
                    <RadioGroupItem value="teacher" id="teacher" />
                    <Label htmlFor="teacher" className="cursor-pointer">Teacher</Label>
                  </div>
                </RadioGroup>
              </div>
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Signing up...' : 'Sign Up'}
              </Button>
              
              {/* Debug button to test API connection */}
              <Button 
                type="button" 
                variant="outline" 
                className="w-full mt-2"
                onClick={async () => {
                  try {
                    const testEndpoint = buildApiUrl('test-env');
                    console.log('Testing API connection to:', testEndpoint);
                    const res = await fetch(testEndpoint);
                    const data = await res.json();
                    console.log('API test response:', data);
                    toast({
                      title: "API Test",
                      description: `Backend reachable: ${res.ok ? 'Yes' : 'No'}`,
                    });
                  } catch (err) {
                    console.error('API test error:', err);
                    toast({
                      title: "API Test Failed",
                      description: "Cannot reach backend",
                      variant: "destructive",
                    });
                  }
                }}
              >
                Test API Connection
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default Signup;
