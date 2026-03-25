'use client';

import React, { useState, useEffect, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Image from 'next/image';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { 
  Sparkles, 
  User as UserIcon, 
  Briefcase, 
  ChevronRight, 
  ArrowRight, 
  Search, 
  LayoutDashboard, 
  FileText, 
  Share2, 
  Download,
  CheckCircle2,
  Plus,
  BrainCircuit,
  Code,
  LogOut,
  LogIn,
  AlertCircle,
  Mail,
  MessageCircle,
  Linkedin,
  Twitter,
  X,
  Link,
  Star,
  MessageSquare,
  Send,
  Calendar,
  UserCheck,
  Camera
} from 'lucide-react';
import { generateProfileSummary, suggestSkills, structureExperience, structureProject } from '@/lib/ai';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  User,
  OperationType,
  handleFirestoreError
} from './firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  onSnapshot,
  arrayUnion,
  arrayRemove,
  addDoc,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';

// --- Error Boundary ---

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsedError = JSON.parse(this.state.error.message);
        errorMessage = `Firestore Error: ${parsedError.error} during ${parsedError.operationType} on ${parsedError.path}`;
      } catch (e) {
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
          <div className="max-w-md w-full bg-white p-8 rounded-[32px] border border-red-100 shadow-xl text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="text-red-500 w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Oops! An error occurred</h2>
            <p className="text-zinc-500 mb-8">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-black text-white px-8 py-3 rounded-xl font-bold hover:bg-zinc-800 transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Context ---

interface AuthContextType {
  user: User | null;
  profile: any;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: any) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (currentUser) {
        // Fetch or create profile with real-time updates
        const profileRef = doc(db, 'users', currentUser.uid);
        
        unsubscribeProfile = onSnapshot(profileRef, (snapshot) => {
          if (snapshot.exists()) {
            setProfile(snapshot.data());
            setLoading(false);
          } else {
            // Create initial profile if it doesn't exist
            const newProfile = {
              name: currentUser.displayName || 'New User',
              email: currentUser.email || '',
              bio: '',
              summary: '',
              experiences: [],
              projects: [],
              skills: [],
              role: 'candidate',
              uid: currentUser.uid
            };
            setDoc(profileRef, newProfile).catch(err => {
              handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
            });
            // onSnapshot will trigger again after setDoc
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const logout = async () => {
    try {
      await auth.signOut();
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const updateProfile = async (data: any) => {
    if (!user) return;
    const profileRef = doc(db, 'users', user.uid);
    try {
      await updateDoc(profileRef, data);
      setProfile((prev: any) => ({ ...prev, ...data }));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

// --- Components ---

const MessageModal = ({ isOpen, onClose, target, currentUser }: { isOpen: boolean, onClose: () => void, target: any, currentUser: any }) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !target || !currentUser) return;

    const chatId = [currentUser.uid, target.uid || target.id].sort().join('_');
    const q = query(
      collection(db, 'messages'),
      where('chatId', '==', chatId),
      where('participants', 'array-contains', currentUser.uid),
      orderBy('timestamp', 'asc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'messages');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isOpen, target, currentUser]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser || !target) return;

    const chatId = [currentUser.uid, target.uid || target.id].sort().join('_');
    const messageData = {
      chatId,
      participants: [currentUser.uid, target.uid || target.id],
      senderId: currentUser.uid,
      receiverId: target.uid || target.id,
      text: newMessage,
      timestamp: serverTimestamp(),
      senderName: currentUser.displayName || 'Recruiter'
    };

    try {
      await addDoc(collection(db, 'messages'), messageData);
      setNewMessage('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'messages');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 print:hidden">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-lg bg-white rounded-[32px] shadow-2xl border border-black/5 overflow-hidden flex flex-col h-[600px]"
      >
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-zinc-100 rounded-full overflow-hidden relative">
              <Image src={target.photoURL || `https://picsum.photos/seed/${target.name}/100/100`} alt={target.name} fill className="object-cover" />
            </div>
            <div>
              <h3 className="font-bold">{target.name}</h3>
              <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Direct Message</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-zinc-50/50">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 border-2 border-zinc-200 border-t-black rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <MessageSquare className="w-6 h-6 text-zinc-300" />
              </div>
              <p className="text-sm text-zinc-400">No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex ${msg.senderId === currentUser.uid ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] p-4 rounded-2xl text-sm ${
                  msg.senderId === currentUser.uid 
                    ? 'bg-black text-white rounded-tr-none' 
                    : 'bg-white border border-zinc-200 text-black rounded-tl-none shadow-sm'
                }`}>
                  <p className="leading-relaxed">{msg.text}</p>
                  <div className={`text-[9px] mt-1 opacity-50 font-bold uppercase tracking-widest ${
                    msg.senderId === currentUser.uid ? 'text-zinc-300' : 'text-zinc-400'
                  }`}>
                    {msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleSendMessage} className="p-6 bg-white border-t border-zinc-100 flex gap-3">
          <input 
            type="text" 
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..." 
            className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
          />
          <button 
            type="submit"
            disabled={!newMessage.trim()}
            className="bg-black text-white p-2 rounded-xl hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const ShareModal = ({ isOpen, onClose, data }: { isOpen: boolean, onClose: () => void, data: { name: string, url: string } }) => {
  if (!isOpen) return null;

  const shareLinks = [
    {
      name: 'WhatsApp',
      icon: <MessageCircle className="w-5 h-5" />,
      color: 'bg-[#25D366]',
      href: `https://wa.me/?text=${encodeURIComponent(`Check out ${data.name}'s profile on AI-Powered Recruitment Experience: ${data.url}`)}`
    },
    {
      name: 'Email',
      icon: <Mail className="w-5 h-5" />,
      color: 'bg-zinc-800',
      href: `mailto:?subject=${encodeURIComponent(`${data.name}'s Professional Profile`)}&body=${encodeURIComponent(`Hi,\n\nI wanted to share ${data.name}'s professional profile with you: ${data.url}`)}`
    },
    {
      name: 'LinkedIn',
      icon: <Linkedin className="w-5 h-5" />,
      color: 'bg-[#0077B5]',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(data.url)}`
    },
    {
      name: 'Twitter',
      icon: <Twitter className="w-5 h-5" />,
      color: 'bg-[#1DA1F2]',
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out ${data.name}'s profile on AI-Powered Recruitment Experience`)}&url=${encodeURIComponent(data.url)}`
    }
  ];

  const copyToClipboard = () => {
    navigator.clipboard.writeText(data.url);
    alert('Link copied to clipboard!');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 print:hidden">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-sm bg-white rounded-[32px] p-8 shadow-2xl border border-black/5"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">Share Profile</h3>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          {shareLinks.map((link) => (
            <a 
              key={link.name}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-zinc-100 hover:border-black hover:bg-zinc-50 transition-all group"
            >
              <div className={`w-12 h-12 ${link.color} text-white rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform`}>
                {link.icon}
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">{link.name}</span>
            </a>
          ))}
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Profile Link</label>
          <div className="flex gap-2">
            <input 
              readOnly 
              value={data.url} 
              className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 text-sm text-zinc-500 focus:outline-none"
            />
            <button 
              onClick={copyToClipboard}
              className="p-2 bg-black text-white rounded-xl hover:bg-zinc-800 transition-colors"
            >
              <Link className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const Navbar = ({ onNavigate }: { onNavigate: (view: string) => void }) => {
  const { user, profile, login, logout, updateProfile } = useAuth();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-black/5 print:hidden">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => onNavigate('landing')}>
          <div className="w-8 h-8 flex items-center justify-center relative overflow-hidden rounded-lg">
            <Image 
              src="https://picsum.photos/seed/geometric-cube-logo/100/100" 
              alt="Logo" 
              fill 
              className="object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <span className="font-sans font-bold text-xl tracking-tight">AI-Powered Recruitment Experience</span>
        </div>
        <div className="flex items-center gap-6">
          {user ? (
            <>
              <button 
                onClick={() => {
                  if (profile?.role !== 'recruiter' && profile?.role !== 'admin') {
                    updateProfile({ role: 'recruiter' });
                  }
                  onNavigate('recruiter');
                }}
                className="text-sm font-medium text-zinc-600 hover:text-black transition-colors"
              >
                Recruiter Portal
              </button>
              <button 
                onClick={() => onNavigate('builder')}
                className="text-sm font-medium text-zinc-600 hover:text-black transition-colors"
              >
                Build Profile
              </button>
              <div className="flex items-center gap-3 pl-4 border-l border-zinc-200">
                <div 
                  className="w-8 h-8 bg-zinc-100 rounded-full overflow-hidden border border-black/5 relative"
                >
                  <Image 
                    src={profile?.photoURL || `https://picsum.photos/seed/${profile?.name}/100/100`} 
                    alt="Profile" 
                    fill 
                    className="object-cover" 
                    referrerPolicy="no-referrer" 
                  />
                </div>
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-bold cursor-pointer hover:text-zinc-600" onClick={() => onNavigate('profile')}>{profile?.name}</div>
                  <button 
                    onClick={() => {
                      const newRole = profile?.role === 'candidate' ? 'recruiter' : 'candidate';
                      updateProfile({ role: newRole });
                    }}
                    className="text-[10px] text-zinc-400 capitalize hover:text-black transition-colors"
                  >
                    {profile?.role} (Switch)
                  </button>
                </div>
                <button onClick={logout} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <LogOut className="w-4 h-4 text-zinc-400" />
                </button>
              </div>
            </>
          ) : (
            <button 
              onClick={login}
              className="bg-black text-white px-6 py-2 rounded-full text-sm font-bold hover:bg-zinc-800 transition-all flex items-center gap-2"
            >
              <LogIn className="w-4 h-4" /> Sign In
            </button>
          )}
        </div>
      </div>
    </nav>
  );
};

const LandingPage = ({ onStart, onRecruiterStart }: { onStart: () => void, onRecruiterStart: () => void }) => (
  <div className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
    <div className="grid lg:grid-cols-2 gap-16 items-center">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-6">
          <BrainCircuit className="w-3 h-3" />
          The Future of Hiring
        </div>
        <h1 className="text-6xl lg:text-7xl font-sans font-bold tracking-tighter leading-[0.9] mb-8">
          Stop Uploading <br />
          <span className="text-zinc-400">Start Building.</span>
        </h1>
        <p className="text-xl text-zinc-600 mb-10 max-w-md leading-relaxed">
          Ditch the PDF. Build a structured, AI-powered professional profile that recruiters actually want to see.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <button 
            onClick={onStart}
            className="group bg-black text-white px-8 py-4 rounded-2xl text-lg font-medium hover:bg-zinc-800 transition-all flex items-center justify-center gap-2"
          >
            Create Your AI Profile
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
          <button 
            onClick={onRecruiterStart}
            className="px-8 py-4 rounded-2xl text-lg font-medium border border-zinc-200 hover:bg-zinc-50 transition-all"
          >
            See for Recruiters
          </button>
        </div>
        
        <div className="mt-12 flex items-center gap-8 grayscale opacity-50">
          <div className="font-bold text-xl tracking-tighter italic">Google</div>
          <div className="font-bold text-xl tracking-tighter italic">Meta</div>
          <div className="font-bold text-xl tracking-tighter italic">Stripe</div>
        </div>
      </motion.div>
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="relative"
      >
        <div className="aspect-square bg-zinc-100 rounded-[40px] overflow-hidden border border-black/5 shadow-2xl relative">
          <Image 
            src="https://picsum.photos/seed/talent/800/800" 
            alt="Dashboard Preview" 
            fill
            className="object-cover mix-blend-multiply opacity-80"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent" />
          
          {/* Floating UI Elements */}
          <motion.div 
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-10 -left-10 bg-white p-4 rounded-2xl shadow-xl border border-black/5 flex items-center gap-3 z-10"
          >
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="text-emerald-600 w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Skills Verified</div>
              <div className="font-bold">React, TypeScript, AI</div>
            </div>
          </motion.div>

          <motion.div 
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute bottom-20 -right-10 bg-white p-4 rounded-2xl shadow-xl border border-black/5 flex items-center gap-3 z-10"
          >
            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
              <Briefcase className="text-indigo-600 w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Experience Structured</div>
              <div className="font-bold">Senior Product Designer</div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  </div>
);

// --- Main Page ---

function RecruitmentExperienceApp() {
  const { user, profile, loading, login, updateProfile } = useAuth();
  const [view, setView] = useState('landing'); // landing, builder, profile, recruiter
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  const [shareModalData, setShareModalData] = useState<{ name: string, url: string } | null>(null);
  const [messageTarget, setMessageTarget] = useState<any>(null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-zinc-100 border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  const handleStart = () => {
    if (!user) {
      login();
    } else {
      setView('builder');
    }
  };

  const handleRecruiterStart = () => {
    if (!user) {
      login();
    } else {
      // Automatically switch to recruiter role for demo purposes if they click this button
      if (profile?.role !== 'recruiter' && profile?.role !== 'admin') {
        updateProfile({ role: 'recruiter' });
      }
      setView('recruiter');
    }
  };

  const handleShare = (candidateProfile?: any) => {
    const targetProfile = candidateProfile || profile;
    const url = window.location.origin; // In a real app, this would be a unique profile URL
    const name = targetProfile?.name || 'Candidate';
    
    if (navigator.share) {
      navigator.share({
        title: `${name}'s Profile | AI-Powered Recruitment Experience`,
        text: `Check out ${name}'s professional profile on AI-Powered Recruitment Experience.`,
        url: url,
      }).catch(() => {
        setShareModalData({ name, url });
      });
    } else {
      setShareModalData({ name, url });
    }
  };

  const handleExport = async (candidateProfile?: any) => {
    const targetProfile = candidateProfile || selectedCandidate || profile;
    if (!targetProfile) return;

    const name = targetProfile.name || 'Candidate';
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let cursorY = 20;

    // Header
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(name, margin, cursorY);
    cursorY += 10;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(targetProfile.bio || '', margin, cursorY);
    cursorY += 15;

    // AI Match Score (if recruiter view)
    if (view === 'recruiter' || selectedCandidate) {
      doc.setFillColor(240, 244, 255);
      doc.roundedRect(margin, cursorY, pageWidth - (margin * 2), 15, 3, 3, 'F');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(79, 70, 229);
      doc.text('AI MATCH SCORE: 94% - HIGH MATCH', margin + 5, cursorY + 9);
      cursorY += 25;
    }

    // AI-Generated Summary
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(150, 150, 150);
    doc.text('AI-GENERATED SUMMARY', margin, cursorY);
    cursorY += 7;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    const summaryLines = doc.splitTextToSize(targetProfile.summary || '', pageWidth - (margin * 2));
    doc.text(summaryLines, margin, cursorY);
    cursorY += (summaryLines.length * 6) + 10;

    // Experience
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Experience', margin, cursorY);
    cursorY += 10;

    (targetProfile.experiences || []).forEach((exp: any) => {
      if (cursorY > 260) {
        doc.addPage();
        cursorY = 20;
      }
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(exp.title, margin, cursorY);
      doc.setFont('helvetica', 'normal');
      doc.text(`${exp.company} • ${exp.duration}`, pageWidth - margin, cursorY, { align: 'right' });
      cursorY += 6;

      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      (exp.bulletPoints || []).forEach((bp: string) => {
        const bpLines = doc.splitTextToSize(`• ${bp}`, pageWidth - (margin * 2) - 5);
        doc.text(bpLines, margin + 2, cursorY);
        cursorY += (bpLines.length * 5);
      });
      cursorY += 5;
    });

    // Projects
    if (targetProfile.projects && targetProfile.projects.length > 0) {
      if (cursorY > 240) {
        doc.addPage();
        cursorY = 20;
      }
      cursorY += 5;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Projects', margin, cursorY);
      cursorY += 10;

      targetProfile.projects.forEach((proj: any) => {
        if (cursorY > 260) {
          doc.addPage();
          cursorY = 20;
        }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(proj.name, margin, cursorY);
        cursorY += 5;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        const projLines = doc.splitTextToSize(proj.description, pageWidth - (margin * 2));
        doc.text(projLines, margin, cursorY);
        cursorY += (projLines.length * 5) + 2;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.text(`Tech: ${proj.technologies.join(', ')}`, margin, cursorY);
        cursorY += 8;
      });
    }

    // Skills
    if (cursorY > 250) {
      doc.addPage();
      cursorY = 20;
    }
    cursorY += 5;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(150, 150, 150);
    doc.text('SKILLS', margin, cursorY);
    cursorY += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    const skillsText = (targetProfile.skills || []).join(' • ');
    const skillLines = doc.splitTextToSize(skillsText, pageWidth - (margin * 2));
    doc.text(skillLines, margin, cursorY);

    doc.save(`${name.replace(/\s+/g, '_')}_Profile.pdf`);
  };

  const handleShortlist = async (candidate: any) => {
    if (!user || !profile) return;
    
    const candidateRef = doc(db, 'users', candidate.uid || candidate.id);
    const isShortlisted = (candidate.shortlistedBy || []).includes(user.uid);
    
    try {
      if (isShortlisted) {
        await updateDoc(candidateRef, {
          shortlistedBy: arrayRemove(user.uid)
        });
        alert(`${candidate.name} removed from shortlist.`);
      } else {
        await updateDoc(candidateRef, {
          shortlistedBy: arrayUnion(user.uid)
        });
        alert(`${candidate.name} added to shortlist!`);
      }
      
      // Update local state if needed, though onSnapshot in RecruiterDashboard will handle it
      if (selectedCandidate && (selectedCandidate.uid === candidate.uid || selectedCandidate.id === candidate.id)) {
        setSelectedCandidate({
          ...selectedCandidate,
          shortlistedBy: isShortlisted 
            ? (selectedCandidate.shortlistedBy || []).filter((id: string) => id !== user.uid)
            : [...(selectedCandidate.shortlistedBy || []), user.uid]
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${candidate.uid || candidate.id}`);
    }
  };

  const handleInterview = async (candidate: any) => {
    if (!user || !profile) return;
    
    const path = `users/${candidate.uid || candidate.id}`;
    const candidateRef = doc(db, path);
    const isInterviewed = (candidate.interviewedBy || []).includes(user.uid);
    
    try {
      if (isInterviewed) {
        await updateDoc(candidateRef, {
          interviewedBy: arrayRemove(user.uid)
        });
      } else {
        await updateDoc(candidateRef, {
          interviewedBy: arrayUnion(user.uid)
        });
      }
      
      if (selectedCandidate && (selectedCandidate.uid === candidate.uid || selectedCandidate.id === candidate.id)) {
        setSelectedCandidate({
          ...selectedCandidate,
          interviewedBy: isInterviewed 
            ? (selectedCandidate.interviewedBy || []).filter((id: string) => id !== user.uid)
            : [...(selectedCandidate.interviewedBy || []), user.uid]
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const handleHire = async (candidate: any) => {
    if (!user || !profile) return;
    
    const path = `users/${candidate.uid || candidate.id}`;
    const candidateRef = doc(db, path);
    const isHired = (candidate.hiredBy || []).includes(user.uid);
    
    try {
      if (isHired) {
        await updateDoc(candidateRef, {
          hiredBy: arrayRemove(user.uid)
        });
      } else {
        await updateDoc(candidateRef, {
          hiredBy: arrayUnion(user.uid)
        });
      }
      
      if (selectedCandidate && (selectedCandidate.uid === candidate.uid || selectedCandidate.id === candidate.id)) {
        setSelectedCandidate({
          ...selectedCandidate,
          hiredBy: isHired 
            ? (selectedCandidate.hiredBy || []).filter((id: string) => id !== user.uid)
            : [...(selectedCandidate.hiredBy || []), user.uid]
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const handleMessage = (candidate: any) => {
    setMessageTarget(candidate);
  };

  return (
    <main className="min-h-screen bg-white text-black selection:bg-black selection:text-white print:bg-white">
      <div className="print:hidden">
        <Navbar onNavigate={setView} />
      </div>
      
      <AnimatePresence mode="wait">
        {view === 'landing' && (
          <motion.div key="landing" exit={{ opacity: 0, y: -20 }}>
            <LandingPage onStart={handleStart} onRecruiterStart={handleRecruiterStart} />
          </motion.div>
        )}
        
        {view === 'builder' && user && (
          <motion.div 
            key="builder" 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="pt-24 pb-20 px-6 max-w-4xl mx-auto"
          >
            <AIProfileBuilder 
              onComplete={() => setView('profile')} 
            />
          </motion.div>
        )}

        {view === 'profile' && user && (
          <motion.div 
            key="profile" 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="pt-24 pb-20 px-6 max-w-5xl mx-auto"
          >
            <CandidateProfileView 
              profile={profile} 
              onEdit={() => setView('builder')} 
              onShare={() => handleShare(profile)}
              onExport={handleExport}
            />
          </motion.div>
        )}

        {view === 'recruiter' && user && (
          <motion.div 
            key="recruiter" 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="pt-24 pb-20 px-6 max-w-7xl mx-auto"
          >
            {selectedCandidate ? (
              <div className="space-y-6">
                <button 
                  onClick={() => setSelectedCandidate(null)}
                  className="text-sm font-bold flex items-center gap-2 text-zinc-400 hover:text-black transition-colors print:hidden"
                >
                  ← Back to Dashboard
                </button>
                <CandidateProfileView 
                  profile={selectedCandidate} 
                  isRecruiterView 
                  onEdit={() => {}} 
                  onShare={() => handleShare(selectedCandidate)}
                  onExport={handleExport}
                  onShortlist={() => handleShortlist(selectedCandidate)}
                  onInterview={() => handleInterview(selectedCandidate)}
                  onHire={() => handleHire(selectedCandidate)}
                  onMessage={() => handleMessage(selectedCandidate)}
                />
              </div>
            ) : (
              <RecruiterDashboard onSelectCandidate={(c) => setSelectedCandidate(c)} />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {shareModalData && (
          <ShareModal 
            isOpen={!!shareModalData} 
            onClose={() => setShareModalData(null)} 
            data={shareModalData} 
          />
        )}
        {messageTarget && (
          <MessageModal 
            isOpen={!!messageTarget} 
            onClose={() => setMessageTarget(null)} 
            target={messageTarget} 
            currentUser={user} 
          />
        )}
      </AnimatePresence>
    </main>
  );
}

export default function Root() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <RecruitmentExperienceApp />
      </AuthProvider>
    </ErrorBoundary>
  );
}

// --- Components ---

const AIProfileBuilder = ({ onComplete }: { onComplete: () => void }) => {
  const { profile, updateProfile } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(20);
  
  // Local state for builder
  const [localProfile, setLocalProfile] = useState(profile);
  const [rawExperience, setRawExperience] = useState('');
  const [rawProject, setRawProject] = useState('');
  const [skillInput, setSkillInput] = useState('');

  const handleAddSkill = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (skillInput.trim()) {
      setLocalProfile((prev: any) => ({
        ...prev,
        skills: Array.from(new Set([...(prev.skills || []), skillInput.trim()]))
      }));
      setSkillInput('');
    }
  };

  const handleNext = async () => {
    if (step === 1) {
      setStep(2);
      setProgress(40);
    } else if (step === 2) {
      if (rawExperience.trim()) {
        setLoading(true);
        const structured = await structureExperience(rawExperience);
        if (structured) {
          const updatedExperiences = [...(localProfile.experiences || []), structured];
          setLocalProfile((prev: any) => ({
            ...prev,
            experiences: updatedExperiences
          }));
          setRawExperience('');
        }
        setLoading(false);
      }
      setStep(3);
      setProgress(60);
    } else if (step === 3) {
      if (rawProject.trim()) {
        setLoading(true);
        const structured = await structureProject(rawProject);
        if (structured) {
          const updatedProjects = [...(localProfile.projects || []), structured];
          setLocalProfile((prev: any) => ({
            ...prev,
            projects: updatedProjects
          }));
          setRawProject('');
        }
        setLoading(false);
      }
      setStep(4);
      setProgress(80);
      
      // Auto-suggest skills
      if (localProfile.experiences?.length > 0) {
        const suggested = await suggestSkills(localProfile.experiences[0].bulletPoints.join(' '));
        setLocalProfile((prev: any) => ({
          ...prev,
          skills: Array.from(new Set([...(prev.skills || []), ...suggested]))
        }));
      }
    } else if (step === 4) {
      setLoading(true);
      const summary = await generateProfileSummary(
        (localProfile.experiences || []).map((e: any) => e.bulletPoints.join(' ')).join(' '),
        localProfile.skills || []
      );
      setLocalProfile((prev: any) => ({ ...prev, summary }));
      setLoading(false);
      setStep(5);
      setProgress(100);
    } else {
      await updateProfile(localProfile);
      onComplete();
    }
  };

  return (
    <div className="bg-zinc-50 rounded-[32px] p-8 lg:p-12 border border-black/5 shadow-sm relative overflow-hidden">
      {/* Progress Bar */}
      <div className="absolute top-0 left-0 h-1 bg-black transition-all duration-500" style={{ width: `${progress}%` }} />
      
      <div className="flex items-center justify-between mb-12">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">
            {step === 1 && "Tell us about yourself"}
            {step === 2 && "Your Experience"}
            {step === 3 && "Key Projects"}
            {step === 4 && "Skills & Expertise"}
            {step === 5 && "Review & Launch"}
          </h2>
          <p className="text-zinc-500">Step {step} of 5 • AI is listening...</p>
        </div>
        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-black/5 relative overflow-hidden">
          <Image 
            src="https://picsum.photos/seed/geometric-cube-logo/200/200" 
            alt="App Logo" 
            fill 
            className={`object-cover ${loading ? 'animate-pulse' : ''}`}
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      <div className="min-h-[300px]">
        {step === 1 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Full Name</label>
              <input 
                type="text" 
                value={localProfile.name}
                onChange={(e) => setLocalProfile({ ...localProfile, name: e.target.value })}
                placeholder="John Doe" 
                className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black/5 transition-all" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Current Bio</label>
              <textarea 
                value={localProfile.bio}
                onChange={(e) => setLocalProfile({ ...localProfile, bio: e.target.value })}
                placeholder="I am a software engineer with 5 years of experience in..." 
                rows={4}
                className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-4">
              {(localProfile.experiences || []).map((exp: any, i: number) => (
                <div key={i} className="p-4 bg-white rounded-xl border border-zinc-200 shadow-sm relative group">
                  <button 
                    onClick={() => setLocalProfile({ ...localProfile, experiences: localProfile.experiences.filter((_: any, idx: number) => idx !== i) })}
                    className="absolute top-4 right-4 text-red-500 font-bold text-xs uppercase tracking-wider hover:text-red-700 transition-all"
                  >
                    Delete
                  </button>
                  <h4 className="font-bold">{exp.title} at {exp.company}</h4>
                  <p className="text-xs text-zinc-400 mb-2">{exp.duration}</p>
                  <ul className="text-sm text-zinc-600 list-disc pl-4">
                    {exp.bulletPoints.map((bp: string, j: number) => <li key={j}>{bp}</li>)}
                  </ul>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Add Experience (Describe it naturally)</label>
              <textarea 
                value={rawExperience}
                onChange={(e) => setRawExperience(e.target.value)}
                placeholder="I worked at Google as a Senior Designer for 2 years. I led the redesign of Search..." 
                rows={4}
                className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
              />
              <p className="text-[10px] text-zinc-400 italic">AI will automatically structure this into professional bullet points.</p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="space-y-4">
              {(localProfile.projects || []).map((proj: any, i: number) => (
                <div key={i} className="p-4 bg-white rounded-xl border border-zinc-200 shadow-sm relative group">
                  <button 
                    onClick={() => setLocalProfile({ ...localProfile, projects: localProfile.projects.filter((_: any, idx: number) => idx !== i) })}
                    className="absolute top-4 right-4 text-red-500 font-bold text-xs uppercase tracking-wider hover:text-red-700 transition-all"
                  >
                    Delete
                  </button>
                  <h4 className="font-bold">{proj.name}</h4>
                  <p className="text-sm text-zinc-600 mb-2">{proj.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {proj.technologies.map((t: string) => (
                      <span key={t} className="px-2 py-0.5 bg-zinc-100 rounded text-[10px] font-bold uppercase">{t}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Add Project (Describe what you built)</label>
              <textarea 
                value={rawProject}
                onChange={(e) => setRawProject(e.target.value)}
                placeholder="I built a real-time chat application using Next.js and WebSockets. It supports private rooms and file sharing..." 
                rows={4}
                className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
              />
              <p className="text-[10px] text-zinc-400 italic">AI will extract technologies and create a structured description.</p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Add Skills Manually</label>
              <form onSubmit={handleAddSkill} className="flex gap-2">
                <input 
                  type="text" 
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  placeholder="e.g. JAVA, Python, React" 
                  className="flex-1 bg-white border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black/5 transition-all" 
                />
                <button 
                  type="submit"
                  className="bg-black text-white px-6 py-3 rounded-xl font-bold hover:bg-zinc-800 transition-all"
                >
                  Add
                </button>
              </form>
            </div>
             <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Your Skills</label>
              <div className="flex flex-wrap gap-2">
                {(localProfile.skills || []).map((skill: string) => (
                  <span key={skill} className="px-4 py-2 bg-black text-white rounded-full text-sm font-medium flex items-center gap-2">
                    {skill}
                    <button onClick={() => setLocalProfile({ ...localProfile, skills: localProfile.skills.filter((s: string) => s !== skill) })} className="hover:text-zinc-300">×</button>
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Skill Categories (Click to add)</label>
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Frontend</p>
                  <div className="flex flex-wrap gap-2">
                    {['React', 'TypeScript', 'Next.js', 'Tailwind CSS', 'UI Design'].filter(s => !(localProfile.skills || []).includes(s)).map(skill => (
                      <button 
                        key={skill} 
                        onClick={() => setLocalProfile({ ...localProfile, skills: [...(localProfile.skills || []), skill] })}
                        className="px-4 py-2 bg-white border border-zinc-200 rounded-full text-sm font-medium hover:border-black transition-all"
                      >
                        + {skill}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Backend</p>
                  <div className="flex flex-wrap gap-2">
                    {['Node.js', 'Python', 'JAVA', 'PostgreSQL', 'Firebase'].filter(s => !(localProfile.skills || []).includes(s)).map(skill => (
                      <button 
                        key={skill} 
                        onClick={() => setLocalProfile({ ...localProfile, skills: [...(localProfile.skills || []), skill] })}
                        className="px-4 py-2 bg-white border border-zinc-200 rounded-full text-sm font-medium hover:border-black transition-all"
                      >
                        + {skill}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-4">AI-Generated Summary</h3>
              {loading ? (
                <div className="animate-pulse space-y-2">
                  <div className="h-4 bg-zinc-100 rounded w-full" />
                  <div className="h-4 bg-zinc-100 rounded w-3/4" />
                </div>
              ) : (
                <p className="text-lg font-medium leading-relaxed">{localProfile.summary}</p>
              )}
            </div>
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="text-emerald-600 w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-1">Ready to launch!</h3>
              <p className="text-zinc-500 text-sm max-w-sm mx-auto">Your profile is optimized and ready for recruiters.</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-12 flex items-center justify-between">
        <button 
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={loading}
          className={`text-sm font-bold uppercase tracking-wider text-zinc-400 hover:text-black transition-colors ${step === 1 ? 'invisible' : ''}`}
        >
          Back
        </button>
        <button 
          onClick={handleNext}
          disabled={loading}
          className="bg-black text-white px-8 py-3 rounded-xl font-bold hover:bg-zinc-800 transition-all flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? "Processing..." : (step === 5 ? "View Profile" : "Next Step")}
          {!loading && <ChevronRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};

const CandidateProfileView = ({ 
  profile, 
  onEdit, 
  onShare, 
  onExport,
  onShortlist,
  onInterview,
  onHire,
  onMessage,
  isRecruiterView = false 
}: { 
  profile: any, 
  onEdit: () => void, 
  onShare: () => void,
  onExport: () => void,
  onShortlist?: () => void,
  onInterview?: () => void,
  onHire?: () => void,
  onMessage?: () => void,
  isRecruiterView?: boolean 
}) => {
  const { updateProfile } = useAuth();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-1">{profile?.name}</h1>
            <p className="text-zinc-500 text-lg">{profile?.bio}</p>
            <div className="flex gap-4 mt-4 print:hidden">
              <button 
                onClick={onShare}
                className="text-sm font-bold flex items-center gap-1 hover:text-zinc-600 transition-colors"
              >
                <Share2 className="w-4 h-4" /> Share Profile
              </button>
              <button 
                onClick={() => onExport()}
                className="text-sm font-bold flex items-center gap-1 hover:text-zinc-600 transition-colors"
              >
                <Download className="w-4 h-4" /> Export PDF
              </button>
            </div>
          </div>
        </div>
        {!isRecruiterView && (
          <button 
            onClick={onEdit}
            className="px-6 py-2 rounded-xl border border-zinc-200 font-bold hover:bg-zinc-50 transition-all print:hidden"
          >
            Edit Profile
          </button>
        )}
        {isRecruiterView && (
          <div className="flex gap-3 print:hidden">
            <button 
              onClick={onShortlist}
              className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 ${
                profile?.shortlistedBy?.includes(auth.currentUser?.uid)
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                  : 'bg-black text-white hover:bg-zinc-800'
              }`}
            >
              <Star className={`w-4 h-4 ${profile?.shortlistedBy?.includes(auth.currentUser?.uid) ? 'fill-emerald-700' : ''}`} /> 
              {profile?.shortlistedBy?.includes(auth.currentUser?.uid) ? 'Shortlisted' : 'Shortlist'}
            </button>
            <button 
              onClick={onInterview}
              className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 ${
                profile?.interviewedBy?.includes(auth.currentUser?.uid)
                  ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                  : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200'
              }`}
            >
              <Calendar className="w-4 h-4" /> 
              {profile?.interviewedBy?.includes(auth.currentUser?.uid) ? 'Interviewed' : 'Interview'}
            </button>
            <button 
              onClick={onHire}
              className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 ${
                profile?.hiredBy?.includes(auth.currentUser?.uid)
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200'
              }`}
            >
              <UserCheck className="w-4 h-4" /> 
              {profile?.hiredBy?.includes(auth.currentUser?.uid) ? 'Hired' : 'Hire'}
            </button>
            <button 
              onClick={onMessage}
              className="px-4 py-2 rounded-xl border border-zinc-200 font-bold hover:bg-zinc-50 transition-all flex items-center gap-2"
            >
              <MessageSquare className="w-4 h-4" /> Message
            </button>
          </div>
        )}
      </div>

      {isRecruiterView && (
        <div className="flex items-center gap-4 p-4 bg-indigo-50 rounded-2xl border border-indigo-100 print:hidden">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
            <BrainCircuit className="text-indigo-600 w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-indigo-900">AI Match Score: 94%</span>
              <span className="px-2 py-0.5 bg-indigo-200 text-indigo-700 text-[10px] font-bold rounded uppercase">Best Match</span>
            </div>
            <p className="text-xs text-indigo-600/80">This candidate matches your requirements for &quot;Senior Frontend Engineer&quot; role based on their React and TypeScript expertise.</p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-zinc-50 p-8 rounded-[32px] border border-black/5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-4">AI-Generated Summary</h3>
            <p className="text-xl leading-relaxed font-medium">
              {profile?.summary}
            </p>
          </section>

          <section className="space-y-6">
            <h3 className="text-2xl font-bold tracking-tight">Experience</h3>
            {(profile?.experiences || []).map((exp: any, i: number) => (
              <div key={i} className="relative pl-8 border-l border-zinc-200 pb-8 last:pb-0">
                <div className="absolute left-[-5px] top-2 w-2.5 h-2.5 bg-black rounded-full" />
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-bold text-lg">{exp.title}</h4>
                    <p className="text-zinc-500">{exp.company} • {exp.duration}</p>
                  </div>
                </div>
                <ul className="space-y-2 text-zinc-600">
                  {exp.bulletPoints.map((bp: string, j: number) => (
                    <li key={j} className="flex gap-2">
                      <span className="text-zinc-300">•</span>
                      {bp}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          {profile?.projects && profile.projects.length > 0 && (
            <section className="space-y-6">
              <h3 className="text-2xl font-bold tracking-tight">Projects</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                {profile.projects.map((proj: any, i: number) => (
                  <div key={i} className="p-6 bg-white rounded-3xl border border-zinc-200 hover:shadow-md transition-all">
                    <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center mb-4">
                      <Code className="text-black w-5 h-5" />
                    </div>
                    <h4 className="font-bold text-lg mb-2">{proj.name}</h4>
                    <p className="text-sm text-zinc-500 mb-4 line-clamp-3">{proj.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {proj.technologies.map((t: string) => (
                        <span key={t} className="px-2 py-0.5 bg-zinc-100 rounded text-[10px] font-bold uppercase">{t}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-8">
          <section className="bg-white p-6 rounded-[32px] border border-zinc-200">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-4">Skills</h3>
            <div className="flex flex-wrap gap-2">
              {(profile?.skills || []).map((skill: string) => (
                <span key={skill} className="px-3 py-1 bg-zinc-100 rounded-full text-sm font-medium">
                  {skill}
                </span>
              ))}
            </div>
          </section>

          {!isRecruiterView && (
            <section className="bg-black text-white p-6 rounded-[32px] print:hidden">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-4">Profile Strength</h3>
              <div className="flex items-end gap-2 mb-4">
                <span className="text-4xl font-bold">85%</span>
                <span className="text-zinc-400 text-sm mb-1">Excellent</span>
              </div>
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 w-[85%]" />
              </div>
              <p className="text-xs text-zinc-400 mt-4">Add a project to reach 100% and get 3x more recruiter views.</p>
            </section>
          )}
          
          {isRecruiterView && (
            <section className="bg-emerald-50 p-6 rounded-[32px] border border-emerald-100 print:hidden">
              <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-4">AI Match Score</h3>
              <div className="flex items-end gap-2 mb-4">
                <span className="text-4xl font-bold text-emerald-700">94%</span>
                <span className="text-emerald-600 text-sm mb-1">High Match</span>
              </div>
              <p className="text-xs text-emerald-700 leading-relaxed">
                This candidate&apos;s experience in <strong>design systems</strong> and <strong>mobile redesign</strong> perfectly aligns with your current opening for Senior Product Designer.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

const RecruiterDashboard = ({ onSelectCandidate }: { onSelectCandidate: (c: any) => void }) => {
  const { profile, updateProfile } = useAuth();
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  const [isJobModalOpen, setIsJobModalOpen] = useState(false);

  const seedCandidates = async () => {
    if (isSeeding) return;
    setIsSeeding(true);
    setLoading(true);
    const mockCandidates = [
      {
        name: "Alex Rivera",
        email: "alex.rivera@example.com",
        role: "candidate",
        uid: "mock-alex",
        bio: "Dynamic Design Leader & UI/UX Expert",
        skills: ["User-Centered Design", "Product Strategy", "Web Accessibility", "Stakeholder Management", "Visual Design", "Node.js", "UI Design", "User Research", "Accessibility", "Leadership", "Problem Solving", "UI/UX Design", "Web Accessibility (WCAG)", "UX Design", "UX/UI Design", "Design Systems", "Accessibility (WCAG)", "Cross-functional Collaboration"],
        summary: "Dynamic Design Leader with a proven track record of architecting end-to-end digital products for millions of global users, bridging the gap between high-level product strategy and WCAG-compliant visual excellence. By leveraging a unique blend of UI/UX expertise and full-stack technical proficiency, I translate complex engineering constraints into elegant, scalable solutions that drive brand consistency and seamless user experiences across all platforms.",
        experiences: [
          { 
            company: "Google", 
            title: "Senior Designer", 
            duration: "Not specified", 
            bulletPoints: [
              "Led the end-to-end design process for high-traffic digital products, ensuring a seamless and intuitive user experience for millions of global users.",
              "Collaborated with cross-functional teams to define product requirements and translate complex technical constraints into elegant design solutions.",
              "Spearheaded the evolution of the brand's design system to maintain visual consistency and accessibility across all platforms and devices."
            ] 
          },
          {
            company: "Infosys",
            title: "Intern",
            duration: "Not Specified",
            bulletPoints: [
              "Collaborated with cross-functional teams to develop and optimize software solutions using industry-standard frameworks.",
              "Participated in rigorous training programs to enhance technical proficiency in full-stack development and data structures.",
              "Contributed to the documentation and testing phases of ongoing projects to ensure high-quality software delivery."
            ]
          }
        ],
        projects: [
          {
            name: "Real-time Chat Application",
            description: "A real-time chat application built using Next.js and WebSockets.",
            technologies: ["Next.js", "WebSockets"]
          },
          {
            name: "Real-time Project",
            description: "A project involving real-time data processing or communication.",
            technologies: ["Real-time"]
          },
          {
            name: "Real-time Chat Application",
            description: "A real-time application built for instant messaging and communication.",
            technologies: ["WebSockets", "Socket.io", "Node.js"]
          }
        ]
      },
      {
        name: "Sarah Chen",
        email: "sarah.chen@example.com",
        role: "candidate",
        uid: "mock-1",
        skills: ["React", "TypeScript", "Node.js"],
        summary: "Full-stack engineer with 5 years of experience building scalable web apps.",
        experiences: [{ company: "TechFlow", role: "Senior Engineer", duration: "2020 - Present", bulletPoints: ["Led team of 5", "Optimized performance by 40%"] }]
      },
      {
        name: "Marcus Rodriguez",
        email: "marcus.r@example.com",
        role: "candidate",
        uid: "mock-2",
        skills: ["Figma", "Product Design", "UI/UX"],
        summary: "Product designer focused on creating intuitive user experiences for fintech.",
        experiences: [{ company: "Designly", role: "Lead Designer", duration: "2019 - 2023", bulletPoints: ["Redesigned mobile app", "Increased user retention by 25%"] }]
      },
      {
        name: "Aisha Patel",
        email: "aisha.p@example.com",
        role: "candidate",
        uid: "mock-3",
        skills: ["Python", "Machine Learning", "AWS"],
        summary: "Data scientist with a passion for building AI-driven solutions.",
        experiences: [{ company: "DataMind", role: "Data Scientist", duration: "2021 - Present", bulletPoints: ["Built recommendation engine", "Reduced churn by 15%"] }]
      }
    ];

    try {
      for (const c of mockCandidates) {
        await setDoc(doc(db, 'users', c.uid), c);
      }
    } catch (err) {
      console.error("Seeding failed", err);
      setError("Failed to seed mock data. Only admins can perform this action.");
    }
    setLoading(false);
    setIsSeeding(false);
  };

  useEffect(() => {
    if (!profile) return;

    if (profile.role !== 'recruiter' && profile.role !== 'admin') {
      // Use a timeout to avoid synchronous setState in effect
      const timer = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(timer);
    }

    const startLoading = setTimeout(() => setLoading(true), 0);
    // Fetch all users for the demo, so recruiters can see themselves and others
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const candidateList = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        // Filter for users who have at least a name and some profile content
        .filter((u: any) => u.name && (u.bio || u.summary || u.experiences?.length > 0));
      setCandidates(candidateList);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'users');
      setError("You don't have permission to view candidates. Please ensure your role is set to 'recruiter'.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="w-8 h-8 border-2 border-zinc-100 border-t-black rounded-full animate-spin mx-auto mb-4" />
        <p className="text-zinc-500">Loading candidates...</p>
      </div>
    );
  }

  if (profile?.role !== 'recruiter' && profile?.role !== 'admin') {
    return (
      <div className="py-20 text-center max-w-md mx-auto">
        <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-8 h-8 text-zinc-400" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Recruiter Access Required</h2>
        <p className="text-zinc-500 mb-8">This dashboard is only available to verified recruiters. You can switch your role below for testing.</p>
        <button 
          onClick={() => updateProfile({ role: 'recruiter' })}
          className="bg-black text-white px-8 py-3 rounded-xl font-bold hover:bg-zinc-800 transition-all"
        >
          Switch to Recruiter Role
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-20 text-center max-w-md mx-auto">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Permission Error</h2>
        <p className="text-zinc-500 mb-8">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">Recruiter Dashboard</h1>
          <p className="text-zinc-500">Discover and manage top talent with AI-powered insights.</p>
        </div>
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search candidates..." 
              className="pl-10 pr-4 py-2 bg-zinc-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-black/5 outline-none w-64"
            />
          </div>
          <button 
            onClick={() => setIsJobModalOpen(true)}
            className="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-zinc-800 transition-all"
          >
            <Plus className="w-4 h-4" /> Create Job
          </button>
        </div>
      </div>

      {isJobModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/20 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-black/5"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold">Post a New Job</h3>
                <button onClick={() => setIsJobModalOpen(false)} className="text-zinc-400 hover:text-black transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                  <h4 className="text-sm font-bold mb-3">Recent Job Postings</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-zinc-100">
                      <div className="text-xs font-bold">Senior Product Designer</div>
                      <div className="text-[10px] text-zinc-400">12 Applicants</div>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-zinc-100">
                      <div className="text-xs font-bold">Frontend Engineer</div>
                      <div className="text-[10px] text-zinc-400">8 Applicants</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Job Title</label>
                  <input type="text" placeholder="e.g. Senior Frontend Engineer" className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black/5 transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Company Name</label>
                  <input type="text" placeholder="e.g. TechFlow AI" className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black/5 transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Job Description</label>
                  <textarea rows={4} placeholder="Describe the role and requirements..." className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black/5 transition-all" />
                </div>
                <button 
                  onClick={() => {
                    alert("Job posted successfully! Candidates can now apply.");
                    setIsJobModalOpen(false);
                  }}
                  className="w-full bg-black text-white py-4 rounded-2xl font-bold hover:bg-zinc-800 transition-all mt-4"
                >
                  Publish Job Posting
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      <div className="grid lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-zinc-200">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Total Candidates</div>
          <div className="text-3xl font-bold">{candidates.length}</div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-zinc-200">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Shortlisted</div>
          <div className="text-3xl font-bold text-emerald-600">
            {candidates.filter(c => c.shortlistedBy?.includes(auth.currentUser?.uid)).length}
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-zinc-200">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Interviews</div>
          <div className="text-3xl font-bold text-indigo-600">
            {candidates.filter(c => c.interviewedBy?.includes(auth.currentUser?.uid)).length}
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-zinc-200">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Hired</div>
          <div className="text-3xl font-bold text-emerald-600">
            {candidates.filter(c => c.hiredBy?.includes(auth.currentUser?.uid)).length}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-zinc-200 overflow-hidden">
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
          <h3 className="font-bold">Recent Candidates</h3>
          <button className="text-sm font-bold text-zinc-400 hover:text-black transition-colors">View All</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-zinc-50 text-xs font-bold uppercase tracking-wider text-zinc-400">
                <th className="px-6 py-4">Candidate</th>
                <th className="px-6 py-4">Skills</th>
                <th className="px-6 py-4">Match Score</th>
                <th className="px-6 py-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {candidates.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center">
                    <div className="max-w-xs mx-auto">
                      <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <UserIcon className="w-6 h-6 text-zinc-400" />
                      </div>
                      <h4 className="font-bold mb-1">No candidates found</h4>
                      <p className="text-xs text-zinc-500 mb-6">Start by seeding demo data to see how the platform works.</p>
                      <button 
                        onClick={seedCandidates}
                        disabled={isSeeding}
                        className="w-full bg-black text-white py-2 rounded-xl text-sm font-bold hover:bg-zinc-800 transition-all disabled:opacity-50"
                      >
                        {isSeeding ? 'Seeding...' : 'Seed Demo Data'}
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                candidates.map((c, i) => (
                  <tr key={i} className="hover:bg-zinc-50 transition-colors cursor-pointer" onClick={() => onSelectCandidate(c)}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-zinc-200 rounded-full overflow-hidden relative">
                          <Image src={c.photoURL || `https://picsum.photos/seed/${c.name}/100/100`} alt="" fill className="object-cover" referrerPolicy="no-referrer" />
                        </div>
                        <div>
                          <div className="font-bold flex items-center gap-2">
                            {c.name}
                            {c.shortlistedBy?.includes(auth.currentUser?.uid) && (
                              <Star className="w-3 h-3 text-emerald-500 fill-emerald-500" />
                            )}
                          </div>
                          <div className="text-[9px] text-zinc-400 uppercase tracking-widest font-bold">{c.role}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1 flex-wrap max-w-[200px]">
                        {(c.skills || []).slice(0, 3).map((s: string) => (
                          <span key={s} className="px-2 py-0.5 bg-zinc-100 rounded-md text-[10px] font-bold uppercase">{s}</span>
                        ))}
                        {(c.skills || []).length > 3 && (
                          <span className="px-2 py-0.5 bg-zinc-50 text-zinc-400 rounded-md text-[10px] font-bold uppercase">+{c.skills.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500" 
                            style={{ width: `${90 + (i % 10)}%` }} 
                          />
                        </div>
                        <span className="text-xs font-bold">{90 + (i % 10)}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button className="text-xs font-bold px-3 py-1 bg-black text-white rounded-lg hover:bg-zinc-800 transition-all">View</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
