# Email Verification Setup Guide

## 🚀 **Recommended: Resend (Easiest Setup)**

### Step 1: Sign Up
1. Go to [resend.com](https://resend.com)
2. Create an account
3. Get your API key from the dashboard

### Step 2: Configure Environment
Create a `.env` file in your project root:
```env
RESEND_API_KEY=your_api_key_here
FRONTEND_URL=http://localhost:3001
```

### Step 3: Verify Domain (Optional but Recommended)
1. Add your domain in Resend dashboard
2. Update the `from` field in `server/utils/emailVerification.ts`
3. Change `noreply@yourdomain.com` to your verified domain

## 📧 **Alternative Options**

### **SendGrid**
- **Setup**: More complex, but very reliable
- **Free Tier**: 100 emails/day
- **Best for**: High volume, enterprise use

### **AWS SES**
- **Setup**: Complex, requires AWS knowledge
- **Free Tier**: 62,000 emails/month (first year)
- **Best for**: Cost-conscious, high volume

### **SMTP (Gmail/Outlook)**
- **Setup**: Medium complexity
- **Free Tier**: Varies by provider
- **Best for**: Simple projects, personal use

## 🔧 **Current Implementation**

Your app now supports:
- ✅ **Resend** (when `RESEND_API_KEY` is set)
- ✅ **Fallback mode** (console logging for development)
- ✅ **Beautiful HTML emails** with 桐心成长 branding
- ✅ **24-hour token expiration**
- ✅ **Automatic fallback** if email service fails

## 🧪 **Testing**

1. **Without Resend**: Emails will be logged to console
2. **With Resend**: Real emails will be sent
3. **Development**: Use fallback mode for testing
4. **Production**: Use Resend for real emails

## 💡 **Next Steps**

1. **Get Resend API key** (recommended)
2. **Test signup flow** with fallback mode
3. **Verify emails work** in production
4. **Monitor delivery rates** in Resend dashboard

## 🆘 **Troubleshooting**

- **Emails not sending**: Check API key and domain verification
- **Spam folder**: Check email deliverability settings
- **Rate limits**: Monitor your email service quotas
- **Token expiration**: Tokens expire after 24 hours
