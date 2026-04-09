import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/context/I18nContext';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'teacher' | 'parent'>('parent');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { language, setLanguage, t } = useI18n();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Simple validation
      if (!email.trim() || !password.trim()) {
        toast({
          title: t('toast.title.error'),
          description: t('login.toast.missing'),
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
        title: t('toast.title.error'),
        description: t('login.toast.failed'),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">EduNet</h1>
          <p className="text-muted-foreground">{t('login.subtitle')}</p>
        </div>

        <Card className="glass-card shadow-lg animate-fade-in">
          <CardHeader>
            <CardTitle className="text-2xl text-center">{t('login.title')}</CardTitle>
            <CardDescription className="text-center">
              {t('login.desc')}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="role">{t('login.role.label')}</Label>
                <RadioGroup
                  value={role}
                  onValueChange={(value) => setRole(value as 'parent' | 'teacher')}
                  className="flex space-x-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="parent" id="parent" />
                    <Label htmlFor="parent" className="cursor-pointer">{t('login.role.parent')}</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="teacher" id="teacher" />
                    <Label htmlFor="teacher" className="cursor-pointer">{t('login.role.teacher')}</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('login.email.label')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('login.email.placeholder')}
                  required
                  className="focus-within-ring"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t('login.password.label')}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('login.password.placeholder')}
                  required
                  className="focus-within-ring"
                />
              </div>

              <div className="text-sm text-right">
                <a href="#" className="text-primary hover:underline transition-all">
                  {t('login.forgot')}
                </a>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? t('login.signingIn') : t('login.signIn')}
              </Button>

              {/* Signup link */}
              <div className="text-sm text-center">
                <span>{t('login.signup.prompt')} </span>
                <a
                  href="#"
                  className="text-primary hover:underline"
                  onClick={e => {
                    e.preventDefault();
                    navigate('/signup');
                  }}
                >
                  {t('login.signup.cta')}
                </a>
              </div>
              <div className="text-sm text-center mt-4">
                <span>{t('login.admin.prompt')} </span>
                <a
                  href="/admin/login"
                  className="text-primary hover:underline"
                >
                  {t('login.admin.cta')}
                </a>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-4 right-4"
        onClick={() => setLanguage(language === 'zh-CN' ? 'en' : 'zh-CN')}
      >
        {language === 'zh-CN' ? 'EN' : '中文'}
      </Button>
    </div>
  );
};

export default Login;
