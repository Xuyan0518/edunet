
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {Badge} from '@/components/ui/badge';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'teacher' | 'parent'>('teacher');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      // Simple validation
      if (!email.trim() || !password.trim()) {
        toast({
          title: "Error",
          description: "Please enter both email and password",
          variant: "destructive",
        });
        return;
      }
      
      const success = await login(email, password, role);
      
      if (success) {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: "Login failed",
        description: "Please check your credentials and try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Demo accounts for easy login
  const demoAccounts = [
    { role: 'teacher', email: 'teacher@example.com', password: 'password' },
    { role: 'parent', email: 'parent@example.com', password: 'password' }
  ];

  const fillDemoAccount = (demoRole: 'teacher' | 'parent') => {
    const account = demoAccounts.find(a => a.role === demoRole);
    if (account) {
      setEmail(account.email);
      setPassword(account.password);
      setRole(demoRole as 'teacher' | 'parent');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">EduNet</h1>
          <p className="text-muted-foreground">Bridging the gap between teachers and parents</p>
        </div>
        
        <Card className="glass-card shadow-lg animate-fade-in">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Sign In</CardTitle>
            <CardDescription className="text-center">
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="role">I am a</Label>
                <RadioGroup
                  value={role}
                  onValueChange={(value) => setRole(value as 'teacher' | 'parent')}
                  className="flex space-x-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="teacher" id="teacher" />
                    <Label htmlFor="teacher" className="cursor-pointer">Teacher</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="parent" id="parent" />
                    <Label htmlFor="parent" className="cursor-pointer">Parent</Label>
                  </div>
                </RadioGroup>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  className="focus-within-ring"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="focus-within-ring"
                />
              </div>
              
              <div className="text-sm text-right">
                <a href="#" className="text-primary hover:underline transition-all">
                  Forgot your password?
                </a>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading}
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
              
              <div className="text-sm text-center space-y-2">
                <p className="text-muted-foreground">For demo purposes</p>
                <div className="flex justify-center space-x-2">
                  <Badge 
                    variant="outline" 
                    className="cursor-pointer hover:bg-secondary transition-colors"
                    onClick={() => fillDemoAccount('teacher')}
                  >
                    Teacher Demo
                  </Badge>
                  <Badge 
                    variant="outline" 
                    className="cursor-pointer hover:bg-secondary transition-colors"
                    onClick={() => fillDemoAccount('parent')}
                  >
                    Parent Demo
                  </Badge>
                </div>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default Login;
