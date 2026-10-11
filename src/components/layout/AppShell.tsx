import { can } from "@/app/permissions";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BookOpen,
  LayoutDashboard,
  Users,
  Settings,
  User,
  LogOut,
  Menu,
  GraduationCap
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/context/I18nContext";
import { useWebCopy } from "@/i18n/web";
import { sessionKey } from "@/app/queryKeys";
export default function AppShell() {
  const { user, logout } = useAuth();
  const { language, setLanguage } = useI18n();
  const c = useWebCopy();
  const menuRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [location.pathname]);
  const links = [
    {
      to: "/dashboard",
      label: c("工作台", "Dashboard"),
      icon: LayoutDashboard
    },
    {
      to: "/students",
      label: c(
        user.role === "parent" ? "我的孩子" : "学生档案",
        user.role === "parent" ? "My children" : "Students"
      ),
      icon: Users
    },
    ...(can(user, "catalog")
      ? [
          {
            to: "/planning/grades",
            label: c("学习计划", "Learning plans"),
            icon: BookOpen
          }
        ]
      : []),
    ...(can(user, "catalog")
      ? [
          {
            to: "/subjects",
            label: c("课程目录", "Curriculum"),
            icon: BookOpen
          }
        ]
      : []),
    ...(can(user, "manageStudents")
      ? [{ to: "/parents", label: c("家长目录", "Parents"), icon: Users }]
      : []),
    ...(user.role === "admin"
      ? [
          {
            to: "/admin/dashboard",
            label: c("学生管理", "Student administration"),
            icon: Users
          },
          { to: "/admin/users", label: c("账号审批", "Accounts"), icon: Users },
          {
            to: "/admin/review",
            label: c("内容审核", "Content review"),
            icon: BookOpen
          },
          {
            to: "/admin/plans",
            label: c("计划汇总", "Plan summaries"),
            icon: BookOpen
          },
          {
            to: "/admin/settings",
            label: c("教学设置", "Teaching settings"),
            icon: BookOpen
          }
        ]
      : []),
    { to: "/profile", label: c("个人资料", "Profile"), icon: User },
    { to: "/settings", label: c("设置", "Settings"), icon: Settings }
  ];
  const navigation = (
    <>
      <div className="web-brand">
        <GraduationCap aria-hidden="true" />
        <div>
          <b>桐心成长</b>
          <span>EDUNET · LEARNING TOGETHER</span>
        </div>
      </div>
      <div className="web-account">
        <strong>{user.displayName || user.name}</strong>
        <span>
          {user.isReviewer
            ? c("体验账号", "Reviewer")
            : user.role === "parent"
            ? c("家长", "Parent")
            : user.role === "admin"
            ? c("管理员", "Administrator")
            : c("教师", "Teacher")}
        </span>
      </div>
      <nav aria-label={c("主导航", "Main navigation")}>
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} onClick={() => setOpen(false)}>
            <Icon size={18} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="web-side-footer">
        <BookOpen size={22} aria-hidden="true" />
        <p>{c("陪伴每一步成长", "Supporting every step of growth")}</p>
        <button onClick={logout}>
          <LogOut size={16} aria-hidden="true" />
          {c("退出登录", "Sign out")}
        </button>
      </div>
    </>
  );
  return (
    <div className="web-shell">
      <a className="web-skip" href="#main-content">
        {c("跳到内容", "Skip to content")}
      </a>
      <aside className="web-sidebar">{navigation}</aside>
      <div className="web-main">
        <header className="web-header">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                ref={menuRef}
                className="web-menu"
                variant="ghost"
                aria-label={c("打开导航", "Open navigation")}
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="web-mobile-side"
              closeLabel={c("关闭", "Close")}
              aria-describedby={undefined}
              onCloseAutoFocus={event => {
                event.preventDefault();
                menuRef.current?.focus();
              }}
            >
              <SheetTitle className="sr-only">
                {c("导航", "Navigation")}
              </SheetTitle>
              {navigation}
            </SheetContent>
          </Sheet>
          <span>
            {c("成长中心", "Learning centre")}{" "}
            <span aria-hidden="true"> / </span>{" "}
            {links.find(link => link.to === location.pathname)?.label ||
              c("学生工作区", "Student workspace")}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLanguage(language === "zh-CN" ? "en" : "zh-CN")}
          >
            {language === "zh-CN" ? "EN" : "中文"}
          </Button>
        </header>
        <main id="main-content" tabIndex={-1} key={sessionKey(user).join(":")}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
