import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './styles/main.css';

// Fix Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function App() {
  const [xplanePath, setXplanePath] = useState(localStorage.getItem('xplanePath') || '');
  const [isValidated, setIsValidated] = useState(false);
  const [activeTab, setActiveTab] = useState('catalog');
  const [screenshots, setScreenshots] = useState([]);
  const [hotkey, setHotkey] = useState(localStorage.getItem('screenshotHotkey') || 'Ctrl+Shift+S');
  const [customSPath, setCustomSPath] = useState(localStorage.getItem('customSPath') || '');
  const [catalog, setCatalog] = useState([]);

  // Helper for image paths
  const getScreenshotUrl = (shot) => {
    const base = (customSPath || `${xplanePath}/Assistant_Screenshots`).replace(/\\/g, '/');
    const fileName = encodeURIComponent(shot.fileName);
    return `assistant-media://${base}/${fileName}`;
  };
  const [installedMods, setInstalledMods] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoggedInOrg, setIsLoggedInOrg] = useState(false);
  const [isLoggedInTo, setIsLoggedInTo] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogFilter, setCatalogFilter] = useState('all');
  const [filterPrice, setFilterPrice] = useState('all'); // all, free, paid
  const [priceRange, setPriceRange] = useState([0, 500]);
  const [filterAddonType, setFilterAddonType] = useState('all');
  
  const [filterNewsSource, setFilterNewsSource] = useState('all');
  const [filterNewsAuthor, setFilterNewsAuthor] = useState('all');
  const [isFilterVisible, setIsFilterVisible] = useState(true);
  const [filterEventNetwork, setFilterEventNetwork] = useState('all');
  const [filterEventTime, setFilterEventTime] = useState('all');
  const [filterEventSearch, setFilterEventSearch] = useState('');
  const [savedEvents, setSavedEvents] = useState(() => {
    const saved = localStorage.getItem('xplane-saved-events');
    return saved ? JSON.parse(saved) : [];
  });
  const [filterEventSavedOnly, setFilterEventSavedOnly] = useState(false);
  const [reminders, setReminders] = useState(() => {
    const saved = localStorage.getItem('xplane-reminders');
    return saved ? JSON.parse(saved) : [];
  });
  const [filterEventRemindersOnly, setFilterEventRemindersOnly] = useState(false);
  const [timeMode, setTimeMode] = useState(() => {
    return localStorage.getItem('xplane-time-mode') || 'UTC';
  });

  const [isAddonManagerExpanded, setIsAddonManagerExpanded] = useState(true);

  useEffect(() => {
    localStorage.setItem('xplane-saved-events', JSON.stringify(savedEvents));
  }, [savedEvents]);

  useEffect(() => {
    localStorage.setItem('xplane-reminders', JSON.stringify(reminders));
  }, [reminders]);

  useEffect(() => {
    localStorage.setItem('xplane-time-mode', timeMode);
  }, [timeMode]);
  
  const [vaultSearch, setVaultSearch] = useState('');
  const [vaultFilter, setVaultFilter] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterVersion, setFilterVersion] = useState('all');
  const [sortBy, setSortBy] = useState('popularity');
  const [orgCooldown, setOrgCooldown] = useState(0);
  const [customCatalog, setCustomCatalog] = useState([]);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [customForm, setCustomForm] = useState({ 
    name: '', 
    description: '', 
    type: 'plugin', 
    source: 'Website', 
    url: '',
    author: '',
    downloads: '0',
    rating: 0,
    image: null
  });

  const [feed, setFeed] = useState([]);
  const [simmarketFeed, setSimmarketFeed] = useState([]);
  const [isFetchingFeed, setIsFetchingFeed] = useState(false);

  useEffect(() => {
    if (orgCooldown > 0) {
      const timer = setTimeout(() => setOrgCooldown(orgCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [orgCooldown]);

  const handleToggleSaved = useCallback((itemId) => {
    setSavedEvents(prev => {
      if (prev.includes(itemId)) {
        return prev.filter(l => l !== itemId);
      } else {
        return [...prev, itemId];
      }
    });
  }, []);

  const handleToggleReminded = useCallback((itemId, title) => {
    setReminders(prev => {
      if (prev.includes(itemId)) {
        return prev.filter(r => r !== itemId);
      } else {
        alert(`Reminder set for ${title}! We'll notify you 15 minutes before start.`);
        return [...prev, itemId];
      }
    });
  }, []);

  const [wishlist, setWishlist] = useState({ items: [], settings: { checkIntervalHours: 6 } });
  const [activeSettingsTab, setActiveSettingsTab] = useState('directories');

  const [downloads, setDownloads] = useState({});

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onDownloadProgress) {
      window.electronAPI.onDownloadProgress(({ modId, progress, stage }) => {
        setDownloads(prev => ({ ...prev, [modId]: { progress, stage } }));
      });
    }
  }, []);

  const loadFeed = async () => {
    if (window.electronAPI) {
      setIsFetchingFeed(true);
      const data = await window.electronAPI.getUnifiedFeed();
      setFeed(data);
      setIsFetchingFeed(false);
      
      // Load wishlist
      const wl = await window.electronAPI.getWishlist(xplanePath);
      setWishlist(wl);
      window.electronAPI.startWishlistMonitor(xplanePath);
    }
  };

  const handleToggleWishlist = async (item) => {
    const isWished = wishlist.items.some(i => i.link === item.productUrl || i.link === item.link);
    let newItems;
    if (isWished) {
      newItems = wishlist.items.filter(i => i.link !== item.productUrl && i.link !== item.link);
    } else {
      newItems = [...wishlist.items, {
        id: item.id || item.link,
        title: item.name || item.title,
        link: item.productUrl || item.link,
        image: item.image,
        lastPrice: item.price,
        source: item.source,
        addedAt: new Date().toISOString()
      }];
    }
    const newWishlist = { ...wishlist, items: newItems };
    setWishlist(newWishlist);
    await window.electronAPI.saveWishlist({ xplanePath, wishlist: newWishlist });
  };

  useEffect(() => {
    if (xplanePath && window.electronAPI) loadFeed();
  }, [xplanePath]);

  // Stable Grid Calculation to preserve column count during sidebar toggle
  const gridCols = Math.max(1, Math.floor((window.innerWidth - 100) / 360));
  const stableGridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
    gap: '20px'
  };

  const GlassSelect = ({ value, options, onChange, label }) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const selectedOption = options.find(o => o.value === value) || options[0];

    return (
      <div style={{ position: 'relative', width: '100%' }}>
        {label && <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{label}</label>}
        <div 
          onClick={() => setIsOpen(!isOpen)}
          style={{
            padding: '10px 15px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--panel-border)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.2s ease'
          }}
        >
          <span>{selectedOption.label}</span>
          <span style={{ 
            fontSize: '0.6rem', 
            transform: isOpen ? 'rotate(-90deg)' : 'rotate(90deg)',
            transition: 'transform 0.3s ease',
            opacity: 0.6
          }}>▶</span>
        </div>

        {isOpen && (
          <>
            <div 
              style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }} 
              onClick={() => setIsOpen(false)}
            />
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 5px)',
              left: 0,
              right: 0,
              background: 'rgba(20, 25, 35, 0.95)',
              backdropFilter: 'blur(20px)',
              border: '1px solid var(--panel-border)',
              borderRadius: '8px',
              overflow: 'hidden',
              zIndex: 1001,
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
              animation: 'timeFade 0.2s ease-out forwards'
            }}>
              {options.map(opt => (
                <div 
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  style={{
                    padding: '10px 15px',
                    color: value === opt.value ? 'white' : 'var(--text-secondary)',
                    background: value === opt.value ? 'var(--accent)' : 'transparent',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    transition: 'all 0.2s ease',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.03)'
                  }}
                  onMouseEnter={e => e.target.style.background = value === opt.value ? 'var(--accent)' : 'rgba(255, 255, 255, 0.05)'}
                  onMouseLeave={e => e.target.style.background = value === opt.value ? 'var(--accent)' : 'transparent'}
                >
                  {opt.label}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const FeedCard = React.memo(({ item, itemId, isSaved, onToggleSaved, isReminded, onToggleReminded, timeMode }) => {
    const isArticle = item.type === 'article';
    const isProduct = item.type === 'product';
    const isMedia = item.type === 'media';

    return (
      <div className="glass-panel feed-card-premium animate-in" style={{ 
        padding: '0', 
        overflow: 'hidden', 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease',
        cursor: 'pointer',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.05)'
      }}>
        <div style={{ position: 'relative', height: '180px', overflow: 'hidden' }}>
          {item.image ? (
            <img src={item.image} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.5s ease' }} className="card-image" />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3.5rem', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(147, 51, 234, 0.1))' }}>
              {isArticle ? '📰' : isProduct ? '🛒' : '🖼️'}
            </div>
          )}
          <div style={{ 
            position: 'absolute', 
            top: '12px', 
            left: '12px', 
            background: 'var(--accent)', 
            padding: '4px 12px', 
            borderRadius: '20px', 
            fontSize: '0.65rem', 
            fontWeight: '800',
            color: 'white',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
          }}>
            {item.source.split('.')[0]}
          </div>

          {isMedia && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onToggleSaved(itemId);
              }}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: isSaved ? '#FFD700' : 'white',
                fontSize: '1rem',
                zIndex: 5,
                transition: 'all 0.2s ease'
              }}
            >
              {isSaved ? '⭐' : '☆'}
            </button>
          )}
        </div>
        <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 'bold', marginBottom: '8px', textTransform: 'uppercase' }}>
            {isArticle ? 'Latest News' : isProduct ? 'New Release' : 'Community Spot'}
          </div>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '1.05rem', fontWeight: '700', lineHeight: '1.4', color: 'var(--text-primary)' }}>
            {item.title}
          </h3>
          {isArticle && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 20px 0', lineHeight: '1.6', opacity: 0.8 }}>
              {item.description || 'Check out the latest update from ' + item.source}
            </p>
          )}
          {isProduct && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <span style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--success)' }}>{item.price}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>X-Plane Store</span>
            </div>
          )}
          {isMedia && item.author && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '20px' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                by {item.author}
              </div>
              {item.pubDate && (item.source.includes('vatsim') || item.source.includes('ivao')) && (() => {
                const eventDate = new Date(item.pubDate);
                const now = new Date();
                const diffMs = eventDate - now;
                const diffMins = Math.floor(diffMs / (1000 * 60));
                
                let bgColor = 'rgba(59, 130, 246, 0.1)';
                let textColor = 'var(--accent)';
                let countdownText = '';

                if (diffMs > 0) {
                  if (diffMins < 15) {
                    bgColor = 'rgba(239, 68, 68, 0.15)';
                    textColor = '#ef4444';
                    countdownText = ` (In ${diffMins}m)`;
                  } else if (diffMins < 60) {
                    bgColor = 'rgba(245, 158, 11, 0.15)';
                    textColor = '#f59e0b';
                    countdownText = ` (In ${diffMins}m)`;
                  }
                }

                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                    <div style={{ 
                      fontSize: '0.8rem', 
                      color: textColor, 
                      fontWeight: '600', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '6px',
                      background: bgColor,
                      padding: '4px 8px',
                      borderRadius: '4px',
                      transition: 'all 0.3s ease',
                      minWidth: '140px',
                      justifyContent: 'center'
                    }}>
                      <span>📅</span> 
                      <span key={timeMode} className="time-display-animate">
                        {new Date(item.pubDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} at {timeMode === 'UTC' 
                          ? new Date(item.pubDate).getUTCHours().toString().padStart(2, '0') + ':' + new Date(item.pubDate).getUTCMinutes().toString().padStart(2, '0') + ' Z'
                          : new Date(item.pubDate).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }) + ' Local'}
                        {countdownText}
                      </span>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleReminded(itemId, item.title);
                      }}
                      style={{
                        background: isReminded ? 'var(--accent)' : 'none',
                        border: '1px solid var(--panel-border)',
                        borderRadius: '4px',
                        color: isReminded ? 'white' : 'var(--text-secondary)',
                        fontSize: '0.7rem',
                        padding: '4px 8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                      className="btn-remind"
                    >
                      {isReminded ? '🔔 Scheduled' : '🔔 Remind'}
                    </button>
                  </div>
                );
              })()}
            </div>
          )}
          <div style={{ marginTop: 'auto' }}>
            <button 
              onClick={(e) => {
                e.preventDefault();
                if (window.electronAPI) window.electronAPI.openArticle(item.link);
                else window.open(item.link, '_blank');
              }}
              className="btn-discovery"
              style={{ 
                width: '100%', 
                textAlign: 'center', 
                border: 'none',
                display: 'block',
                padding: '10px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                fontWeight: '600',
                transition: 'all 0.2s ease',
                border: '1px solid rgba(255,255,255,0.1)',
                cursor: 'pointer'
              }}
            >
              {isArticle ? 'Explore Article' : isProduct ? 'Explore Store' : (item.source.includes('vatsim') || item.source.includes('ivao')) ? 'Participate' : 'Explore Media'}
            </button>
          </div>
        </div>
      </div>
    );
  });


  const loadInstalledMods = async (path) => {
    if (window.electronAPI) {
      const mods = await window.electronAPI.getMods(path);
      setInstalledMods(mods);
    }
  };

  useEffect(() => {
    // Load catalog
    fetch('/catalog.json')
      .then(res => res.json())
      .then(data => setCatalog(data))
      .catch(err => console.error("Failed to load catalog:", err));
      
    // Auto validate if path is saved
    if (xplanePath && window.electronAPI) {
      handleValidatePath();
    }

    if (window.electronAPI) {
      window.electronAPI.onScreenshotCaptured((meta) => {
        setScreenshots(prev => [...prev, meta]);
        new Notification("Screenshot Captured!", { body: `Saved at ${meta.lat.toFixed(2)}, ${meta.lng.toFixed(2)}` });
      });

      window.electronAPI.onScreenshotsUpdated(() => {
        console.log('Detected folder change, reloading screenshots...');
        loadScreenshots();
      });
    }
  }, []);

  const loadScreenshots = async () => {
    if (window.electronAPI && xplanePath) {
      const shots = await window.electronAPI.getScreenshots({ xplanePath });
      setScreenshots(shots);
    }
  };

  const handleDeleteMod = async (mod) => {
    if (!window.confirm(`Are you sure you want to delete ${mod.name}? This will remove all files from your X-Plane directory.`)) return;
    
    if (window.electronAPI) {
      const res = await window.electronAPI.deleteMod({ 
        xplanePath, 
        modId: mod.id, 
        modType: mod.type 
      });
      if (res.success) {
        loadInstalledMods(xplanePath);
      } else {
        alert('Failed to delete mod: ' + res.error);
      }
    }
  };

  const handleDeleteCustomAddon = async (addon) => {
    if (!window.confirm(`Are you sure you want to remove ${addon.name} from your custom catalog?`)) return;
    
    if (window.electronAPI) {
      const res = await window.electronAPI.deleteCustomAddon({ xplanePath, id: addon.id });
      if (res.success) {
        const data = await window.electronAPI.getCustomCatalog(xplanePath);
        setCustomCatalog(data);
      } else {
        alert('Failed to remove addon: ' + res.error);
      }
    }
  };

  useEffect(() => {
    if (isValidated && xplanePath && window.electronAPI) {
      window.electronAPI.startScreenshotService({ xplanePath });
      loadScreenshots();
    }
  }, [isValidated, xplanePath]);

  const handleValidatePath = async () => {
    setErrorMsg('');
    if (!xplanePath) return;
    
    if (window.electronAPI) {
      const result = await window.electronAPI.checkPath(xplanePath);
      if (result.success) {
        setIsValidated(true);
        localStorage.setItem('xplanePath', xplanePath);
        loadInstalledMods(xplanePath);
        
        // Load custom catalog
        const custom = await window.electronAPI.getCustomCatalog(xplanePath);
        setCustomCatalog(custom);
      } else {
        setErrorMsg(result.error);
      }
    } else {
      // Mock validation for browser dev
      if (xplanePath.toLowerCase().includes('x-plane') || xplanePath.length > 3) {
        setIsValidated(true);
        localStorage.setItem('xplanePath', xplanePath);
      } else {
        setErrorMsg("Please enter a valid X-Plane 12 directory path.");
      }
    }
  };

  const handleSaveCustomAddon = async () => {
    if (!customForm.name || !customForm.url) {
      alert("Name and URL are required!");
      return;
    }
    
    const newAddon = {
      id: `custom_${Date.now()}`,
      name: customForm.name,
      description: customForm.description || "Custom add-on",
      type: customForm.type,
      source: customForm.source,
      url: customForm.url,
      author: customForm.author || "Unknown",
      downloads: customForm.downloads || "0",
      rating: customForm.rating || 0,
      image: customForm.image,
      version: "1.0",
      compatibility: ["12"],
      isCustom: true
    };
    
    const updatedCustomCatalog = [...customCatalog, newAddon];
    setCustomCatalog(updatedCustomCatalog);
    
    if (window.electronAPI) {
      await window.electronAPI.saveCustomCatalog({ xplanePath, customCatalog: updatedCustomCatalog });
    }
    
    setShowCustomModal(false);
    setCustomForm({ name: '', description: '', type: 'plugin', source: 'Website', url: '', author: '', downloads: '0', rating: 0, image: null });
  };

  const handleLoginOrg = async () => {
    if (window.electronAPI) {
      const res = await window.electronAPI.loginXPlaneOrg();
      if (res.success) {
        setIsLoggedInOrg(true);
        alert("Logged in successfully! Session cookies saved for X-Plane.org.");
      }
    } else {
      setShowLoginModal(true);
    }
  };

  const handleLoginTo = async () => {
    if (window.electronAPI) {
      const res = await window.electronAPI.loginXPlaneTo();
      if (res.success) {
        setIsLoggedInTo(true);
        alert("Logged in successfully! Session cookies saved for X-Plane.to.");
      }
    }
  };

  const simulateLoginComplete = () => {
    setShowLoginModal(false);
    setIsLoggedInOrg(true);
  };

  const handleBrowsePath = async () => {
    if (window.electronAPI && window.electronAPI.selectDirectory) {
      const selectedPath = await window.electronAPI.selectDirectory();
      if (selectedPath) {
        setXplanePath(selectedPath);
      }
    } else {
      alert("Native directory selection is only available in the desktop app.");
    }
  };

  if (!isValidated) {
    return (
      <div className="app-container">
        <div className="glass-panel setup-view" style={{ flex: 1 }}>
          <div className="brand-icon" style={{ width: 64, height: 64, fontSize: '2rem', marginBottom: 20 }}>✈️</div>
          <h1 style={{ fontSize: '2.5rem', marginBottom: 10 }}>X-Plane Assistant</h1>
          <p style={{ color: 'var(--text-secondary)', maxWidth: 600 }}>
            Enter the path to your X-Plane 12 installation directory to get started. 
            We will create a Mod Vault inside to safely manage your add-ons.
          </p>
          <div className="path-input-group">
            <input 
              type="text" 
              className="path-input" 
              placeholder="e.g. C:\Program Files (x86)\Steam\steamapps\common\X-Plane 12"
              value={xplanePath}
              onChange={(e) => setXplanePath(e.target.value)}
            />
            <button className="btn btn-secondary" onClick={handleBrowsePath}>Browse...</button>
            <button className="btn btn-primary" onClick={handleValidatePath}>Continue</button>
            <button 
              className="btn btn-secondary" 
              style={{ background: 'transparent', border: '1px solid var(--panel-border)', opacity: 0.7 }}
              onClick={() => {
                setIsValidated(true);
                setXplanePath('');
                localStorage.setItem('xplanePath', '');
              }}
            >
              Skip for now
            </button>
          </div>
          {errorMsg && <p style={{ color: 'var(--danger)', marginTop: 15 }}>{errorMsg}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ position: 'relative' }}>
      {showLoginModal && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
        }}>
          <div className="glass-panel" style={{ width: 400, textAlign: 'center' }}>
            <h2 style={{ marginBottom: 15 }}>Login to X-Plane.org</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: '0.9rem' }}>
              In the desktop app, a secure browser window will open here. You will log in normally, and the app will capture your session cookies to enable downloads.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input type="text" className="path-input" placeholder="Username (Simulation)" />
              <input type="password" className="path-input" placeholder="Password (Simulation)" />
              <button className="btn btn-primary" style={{ justifyContent: 'center', marginTop: 10 }} onClick={simulateLoginComplete}>
                Simulate Login
              </button>
            </div>
          </div>
        </div>
      )}

      {showCustomModal && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110
        }}>
          <div className="glass-panel" style={{ width: 500 }}>
            <h2 style={{ marginBottom: 15 }}>Add Custom Add-on</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 5, fontSize: '0.9rem' }}>Add-on Name</label>
                <input 
                  type="text" 
                  className="path-input" 
                  placeholder="e.g. My Custom Plugin" 
                  value={customForm.name}
                  onChange={e => setCustomForm({...customForm, name: e.target.value})}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 5, fontSize: '0.9rem' }}>Description</label>
                <textarea 
                  className="path-input" 
                  style={{ height: 60, resize: 'none' }}
                  placeholder="Short description..." 
                  value={customForm.description}
                  onChange={e => setCustomForm({...customForm, description: e.target.value})}
                />
              </div>
              <div style={{ marginBottom: 15 }}>
                <label style={{ display: 'block', marginBottom: 5, fontSize: '0.9rem' }}>URL (X-Plane.org / X-Plane.to / etc)</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input 
                    className="path-input" 
                    style={{ flex: 1 }}
                    value={customForm.url} 
                    onChange={e => setCustomForm({ ...customForm, url: e.target.value })}
                    placeholder="https://forums.x-plane.org/index.php?/files/file/..."
                  />
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: '0 15px' }}
                    onClick={async () => {
                      if (!customForm.url) return;
                      setIsFetching(true);
                      try {
                        const meta = await window.electronAPI.fetchModMetadata({ url: customForm.url });
                        if (meta) {
                          setCustomForm(prev => ({
                            ...prev,
                            author: meta.author !== 'Unknown' ? meta.author : prev.author,
                            downloads: meta.downloads !== '0' ? meta.downloads : prev.downloads,
                            rating: meta.rating || prev.rating,
                            image: meta.image || prev.image
                          }));
                        } else {
                          alert("Could not fetch metadata automatically. Please enter manually.");
                        }
                      } catch (e) {
                        console.error(e);
                      } finally {
                        setIsFetching(false);
                      }
                    }}
                    disabled={isFetching}
                  >
                    {isFetching ? '...' : 'Fetch Data'}
                  </button>
                </div>
              </div>
              <div style={{ marginBottom: 15 }}>
                <label style={{ display: 'block', marginBottom: 5, fontSize: '0.9rem' }}>Author</label>
                <input 
                  className="path-input" 
                  value={customForm.author || ''} 
                  onChange={e => setCustomForm({ ...customForm, author: e.target.value })}
                  placeholder="e.g. Saso Kiselkov"
                />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: 5, fontSize: '0.9rem' }}>Type</label>
                  <select 
                    className="path-input" 
                    value={customForm.type} 
                    onChange={e => setCustomForm({ ...customForm, type: e.target.value })}
                  >
                    <option value="plugin">Plugin</option>
                    <option value="aircraft">Aircraft</option>
                    <option value="scenery">Scenery</option>
                    <option value="script">Script (FlyWithLua)</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: 5, fontSize: '0.9rem' }}>Source</label>
                  <select className="path-input" value={customForm.source} onChange={e => setCustomForm({...customForm, source: e.target.value})}>
                    <option value="Website">Website</option>
                    <option value="Cloud Storage">Cloud Storage (Google Drive, Mega, etc.)</option>
                    <option value="GitHub">GitHub</option>
                    <option value="Direct">Direct Link</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 5, fontSize: '0.9rem' }}>Download / Product URL</label>
                <input 
                  type="text" 
                  className="path-input" 
                  placeholder="https://..." 
                  value={customForm.url}
                  onChange={e => setCustomForm({...customForm, url: e.target.value})}
                />
                <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 5 }}>
                  For Cloud Storage/Website, the app will open a browser for manual download interception.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowCustomModal(false)}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSaveCustomAddon}>Save to Catalog</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="glass-panel sidebar">
        <div className="brand">
          <div className="brand-icon">✈️</div>
          X-Plane Assistant
        </div>
        
        <div style={{ marginTop: 20 }}>
          {/* Addon Manager Parent */}
          <div 
            className={`nav-item ${activeTab === 'catalog' || activeTab === 'vault' ? 'active' : ''}`} 
            onClick={() => setIsAddonManagerExpanded(!isAddonManagerExpanded)}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span>🛠️ Addon Manager</span>
            <span style={{ 
              fontSize: '0.6rem', 
              transform: isAddonManagerExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.3s ease'
            }}>▶</span>
          </div>

          {/* Sub-items */}
          {isAddonManagerExpanded && (
            <div style={{ paddingLeft: '15px', marginBottom: '10px' }}>
              <div 
                className={`nav-item ${activeTab === 'catalog' ? 'active' : ''}`} 
                onClick={() => setActiveTab('catalog')}
                style={{ fontSize: '0.85rem', padding: '8px 12px' }}
              >
                📥 Add-on Catalog
              </div>
              <div 
                className={`nav-item ${activeTab === 'vault' ? 'active' : ''}`} 
                onClick={() => setActiveTab('vault')}
                style={{ fontSize: '0.85rem', padding: '8px 12px' }}
              >
                💾 Installed Addons ({installedMods.filter(m => m.enabled).length}/{installedMods.length})
              </div>
            </div>
          )}

          <div className={`nav-item ${activeTab === 'news' ? 'active' : ''}`} onClick={() => setActiveTab('news')}>
            <span>📰</span> Community & News
          </div>
          <div className={`nav-item ${activeTab === 'community' ? 'active' : ''}`} onClick={() => setActiveTab('community')}>
            📅 Community Events
          </div>
          <div className={`nav-item ${activeTab === 'modpacks' ? 'active' : ''}`} onClick={() => setActiveTab('modpacks')}>
            📋 Modpacks
          </div>
          <div className={`nav-item ${activeTab === 'map' ? 'active' : ''}`} onClick={() => setActiveTab('map')}>
            🗺️ Flight Map
          </div>
          <div 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} 
            onClick={() => setActiveTab('settings')}
            style={{ position: 'relative' }}
          >
            <span>⚙️</span> Settings
            {!xplanePath && (
              <div style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                width: '8px',
                height: '8px',
                background: 'var(--danger)',
                borderRadius: '50%',
                boxShadow: '0 0 10px var(--danger)'
              }} />
            )}
          </div>
        </div>

        <div style={{ marginTop: 'auto' }}>
          <button 
            className="btn btn-primary" 
            style={{ width: '100%', marginBottom: '15px', background: 'var(--success)' }}
            onClick={async () => {
              if (window.electronAPI) {
                const res = await window.electronAPI.launchGame(xplanePath);
                if (!res.success) {
                  alert('Launch failed: ' + res.error);
                }
              } else {
                alert('Launch game is only supported in the desktop app.');
              }
            }}
          >
            🚀 Launch X-Plane 12
          </button>
          <div className="nav-item" onClick={!isLoggedInOrg ? handleLoginOrg : undefined} style={{ cursor: isLoggedInOrg ? 'default' : 'pointer' }}>
            {isLoggedInOrg ? '✅ Authenticated (X-Plane.org)' : '🔐 Login to X-Plane.org'}
          </div>
          <div className="nav-item" onClick={!isLoggedInTo ? handleLoginTo : undefined} style={{ cursor: isLoggedInTo ? 'default' : 'pointer' }}>
            {isLoggedInTo ? '✅ Authenticated (X-Plane.to)' : '🔐 Login to X-Plane.to'}
          </div>
          <div style={{ 
            fontSize: '0.65rem', 
            color: 'var(--text-secondary)', 
            textAlign: 'center', 
            marginTop: '10px',
            opacity: 0.5,
            letterSpacing: '1px'
          }}>
            VERSION 1.0.5
          </div>
        </div>
      </div>

      <div className="glass-panel main-content" style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {!xplanePath && (
          <div className="animate-in" style={{
            background: 'rgba(239, 68, 68, 0.15)',
            borderBottom: '1px solid var(--danger)',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--danger)', fontWeight: '600', fontSize: '0.9rem' }}>
              <span>⚠️</span>
              X-Plane path is not set. Most features will be unavailable.
            </div>
            <button 
              className="btn btn-primary" 
              style={{ 
                padding: '6px 16px', 
                fontSize: '0.8rem', 
                background: 'var(--danger)',
                border: 'none',
                boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)'
              }}
              onClick={() => {
                setActiveTab('settings');
                setActiveSettingsTab('directories');
              }}
            >
              Set Path Now
            </button>
          </div>
        )}
        {(activeTab === 'catalog' || activeTab === 'vault') && (
          <>
            <header className="content-header" style={{ 
              padding: '20px 40px', 
              background: 'rgba(255,255,255,0.03)',
              borderBottom: '1px solid var(--panel-border)',
              borderRadius: '12px 12px 0 0',
              marginBottom: '0'
            }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', width: '100%' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input 
                    type="text" 
                    placeholder="Search for addons, aircraft, scenery..." 
                    value={activeTab === 'catalog' ? catalogSearch : vaultSearch}
                    onChange={e => activeTab === 'catalog' ? setCatalogSearch(e.target.value) : setVaultSearch(e.target.value)}
                    style={{ 
                      width: '100%', 
                      padding: '10px 20px', 
                      borderRadius: '6px', 
                      border: '1px solid var(--panel-border)', 
                      fontSize: '0.95rem',
                      background: 'rgba(0,0,0,0.2)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>
                <button style={{ 
                  background: 'var(--accent)', 
                  color: 'white', 
                  border: 'none', 
                  padding: '10px 15px', 
                  borderRadius: '6px', 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  🔍
                </button>
              </div>
            </header>

            <div className="category-container" style={{ 
              padding: '15px 40px', 
              borderBottom: '1px solid var(--panel-border)',
              background: 'rgba(255,255,255,0.01)',
              display: 'flex',
              alignItems: 'center',
              gap: '20px'
            }}>
              <div style={{ display: 'flex', gap: '8px', paddingRight: '20px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                <div 
                  onClick={() => {
                    setFilterAddonType('wishlist');
                    setFilterPrice('all');
                  }}
                  className={`filter-chip ${filterAddonType === 'wishlist' ? 'active' : ''}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '20px',
                    background: filterAddonType === 'wishlist' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.03)',
                    color: filterAddonType === 'wishlist' ? '#ef4444' : 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: '0.75rem', fontWeight: '700', transition: 'all 0.2s ease',
                    border: '1px solid ' + (filterAddonType === 'wishlist' ? '#ef4444' : 'rgba(255,255,255,0.05)'),
                    textTransform: 'uppercase'
                  }}
                >
                  <span>❤️</span>
                  <span>Wishlist</span>
                </div>
                {[
                  { id: 'free', name: 'Freeware', icon: '💎' },
                  { id: 'paid', name: 'Paid', icon: '💰' }
                ].map(p => (
                  <div 
                    key={p.id}
                    onClick={() => {
                      setFilterPrice(p.id);
                      if (filterAddonType === 'wishlist') setFilterAddonType('all');
                    }}
                    className={`filter-chip ${filterPrice === p.id && filterAddonType !== 'wishlist' ? 'active' : ''}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '20px',
                      background: (filterPrice === p.id && filterAddonType !== 'wishlist') ? 'rgba(170, 59, 255, 0.2)' : 'rgba(255,255,255,0.03)',
                      color: (filterPrice === p.id && filterAddonType !== 'wishlist') ? 'var(--accent)' : 'var(--text-secondary)',
                      cursor: 'pointer', fontSize: '0.75rem', fontWeight: '700', transition: 'all 0.2s ease',
                      border: '1px solid ' + ((filterPrice === p.id && filterAddonType !== 'wishlist') ? 'var(--accent)' : 'rgba(255,255,255,0.05)'),
                      textTransform: 'uppercase'
                    }}
                  >
                    <span>{p.icon}</span>
                    <span>{p.name}</span>
                  </div>
                ))}
              </div>

              {/* Category Group */}
              <div className="category-bar" style={{ 
                display: 'flex', 
                gap: '10px', 
                overflowX: 'auto', 
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              }}>
                {[
                  { id: 'all', name: 'All', icon: '🌐' },
                  { id: 'scenery', name: 'Scenery', icon: '⛰️' },
                  { id: 'utility', name: 'Utilities', icon: '⚙️' },
                  { id: 'aircraft', name: 'Aircraft', icon: '✈️' },
                  { id: 'script', name: 'Scripts', icon: '📜' },
                  { id: 'plugin', name: 'Plugins', icon: '🔌' },
                  { id: 'library', name: 'Libraries', icon: '📚' },
                  { id: 'popular', name: 'Popular', icon: '🏆' }
                ].map(cat => {
                  const currentFilter = activeTab === 'catalog' ? filterAddonType : vaultFilter;
                  const setFilter = activeTab === 'catalog' ? setFilterAddonType : setVaultFilter;
                  return (
                    <div 
                      key={cat.id}
                      onClick={() => setFilter(cat.id)}
                      className={`filter-chip ${currentFilter === cat.id ? 'active' : ''}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 18px',
                        borderRadius: '25px',
                        background: currentFilter === cat.id ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                        color: currentFilter === cat.id ? 'white' : 'var(--text-primary)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        transition: 'all 0.2s ease',
                        border: '1px solid ' + (currentFilter === cat.id ? 'var(--accent)' : 'rgba(255,255,255,0.1)')
                      }}
                    >
                      <span>{cat.icon}</span>
                      <span>{cat.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
        
        {activeTab === 'catalog' && (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
            {/* Advanced Filter Sidebar */}
            <div className="glass-panel" style={{ 
              flex: `0 0 ${isFilterVisible ? '240px' : '0px'}`,
              width: isFilterVisible ? '240px' : '0px', 
              margin: isFilterVisible ? '20px 0 20px 20px' : '20px 0 20px 0', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '20px',
              padding: isFilterVisible ? '20px' : '0',
              borderRight: isFilterVisible ? '1px solid var(--panel-border)' : 'none',
              transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
              opacity: isFilterVisible ? 1 : 0,
              overflow: 'hidden',
              position: 'relative',
              willChange: 'flex-basis, width, margin, opacity'
            }}>
              {/* Toggle Arrow */}
              <div 
                onClick={() => setIsFilterVisible(!isFilterVisible)}
                style={{
                  position: 'absolute',
                  right: isFilterVisible ? '-10px' : '-10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '12px',
                  height: '64px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 1000,
                  transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                }}
              >
                <div style={{
                  width: '4px',
                  height: '16px',
                  background: 'var(--accent)',
                  borderRadius: '2px',
                  opacity: 0.8,
                  transition: 'all 0.3s ease',
                  transform: isFilterVisible ? 'rotate(0deg)' : 'rotate(180deg)'
                }} />
              </div>

              {isFilterVisible && (
                <>
                  <h3 style={{ fontSize: '0.9rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px' }}>Advanced Filters</h3>
                  
                  {/* Price Model moved to top bar */}

                  {filterPrice === 'paid' && (
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Max Price: ${priceRange[1]}</label>
                      <input 
                        type="range" 
                        min="0" 
                        max="500" 
                        value={priceRange[1]} 
                        onChange={e => setPriceRange([0, parseInt(e.target.value)])}
                        style={{ width: '100%', accentColor: 'var(--accent)' }}
                      />
                    </div>
                  )}

                  {/* Category dropdown removed as it's now in the top bar */}

                  <button 
                    className="btn btn-secondary" 
                    style={{ marginTop: 'auto', fontSize: '0.8rem', padding: '8px' }}
                    onClick={() => {
                      setFilterPrice('all');
                      setPriceRange([0, 500]);
                      setFilterAddonType('all');
                      setCatalogSearch('');
                      setCatalogFilter('all');
                    }}
                  >
                    Reset Filters
                  </button>
                </>
              )}
            </div>

            <div 
              onClick={() => setIsFilterVisible(!isFilterVisible)}
              style={{
                position: 'absolute',
                left: isFilterVisible ? '260px' : '0px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '32px',
                height: '64px',
                background: 'var(--panel-bg)',
                border: '1px solid var(--panel-border)',
                borderLeft: 'none',
                borderRadius: '0 8px 8px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 1000,
                transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: '4px 0 15px rgba(0,0,0,0.3)',
                color: 'var(--text-secondary)'
              }}
            >
              <span style={{ 
                transform: isFilterVisible ? 'rotate(0deg)' : 'rotate(180deg)', 
                transition: 'transform 0.4s ease' 
              }}>◀</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
                <section>
                  <h2 className="discovery-section-title">
                    <span>🔥</span> Recommended for You
                  </h2>
                  <div className="mod-grid" style={stableGridStyle}>
                    {[
                      ...customCatalog, 
                      ...catalog,
                      ...[...feed.filter(i => {
                        if (i.type !== 'product') return false;
                        const t = i.title.toLowerCase();
                        // If it explicitly mentions XP11 and NOT XP12, filter it out
                        if (t.includes('xp11') && !t.includes('xp12') && !t.includes('v12')) return false;
                        return true;
                      }).map(i => ({...i, source: 'X-Plane Store'})), 
                          ...simmarketFeed.map(i => ({...i, source: 'Simmarket'}))].map((i, idx) => {
                        const titleLower = i.title.toLowerCase();
                        const isNew = titleLower.includes('new') || titleLower.includes('version');
                        const newLabel = titleLower.includes('version') ? 'NEW VERSION' : 'NEW';
                        
                        const desc = (i.description || "").toLowerCase();
                        const descPrices = i.description ? i.description.match(/[\$€]\d+\.\d+/g) : null;
                        const mainPrices = i.price ? i.price.match(/[\$€]\d+\.\d+/g) : null;
                        
                        let price = i.price;
                        let oldPrice = null;

                        if (desc.includes('retail price') || desc.includes('you save')) {
                          if (descPrices && descPrices.length >= 2) {
                            oldPrice = descPrices[0];
                            price = descPrices[1];
                          }
                        } 
                        
                        if (!oldPrice && mainPrices && mainPrices.length >= 2) {
                          oldPrice = mainPrices[0];
                          price = mainPrices[1];
                        }

                        // Artificial sale logic removed to ensure 100% accuracy

                        if (!oldPrice && mainPrices) price = mainPrices[0];
                        if (price && typeof price === 'string') price = price.split(' ')[0];

                        const titleParts = i.title.split(' - ');
                        // Priority: 1. Author from slug (aggregator), 2. Known list, 3. Title split
                        let devName = i.author || i.source;
                        let productName = i.title;
                        
                        const knownDevs = [
                          'ToLiss', 'JARDesign', 'FlightFactor', 'Aerobask', 'Just Flight', 
                          'Thranda', 'vFlyteAir', 'Carenado', 'Rotate', 'FlyJSim', 
                          'SSG', 'Magknight', 'X-Crafts', 'Airfoillabs', 'Colimata', 
                          'Aerosoft', 'JustFlight', 'V-FLYTE-AIR', 'VSKYLABS', 'Torquesim'
                        ];

                        // If slug author is generic or missing, try known list or title split
                        if (!i.author || i.author === 'store.x-plane.org') {
                          const foundDev = knownDevs.find(d => i.title.toLowerCase().includes(d.toLowerCase()));
                          if (foundDev) {
                            devName = foundDev;
                          } else if (i.title.toLowerCase().includes(' by ')) {
                            const parts = i.title.split(/ by /i);
                            productName = parts[0];
                            devName = parts[1];
                          } else if (titleParts.length > 1) {
                            devName = titleParts[0];
                            productName = titleParts.slice(1).join(' - ');
                          }
                        }

                        // Clean up author name
                        devName = devName.replace(/\(.*\)/g, '') // Remove parentheses
                                        .replace(/XP12|XP11|XP10/gi, '')
                                        .replace(/ADD-ON|PRO/gi, '')
                                        .replace(/-/g, ' ')
                                        .trim();
                        
                        // Map common slug IDs to real names
                        const devMap = {
                          'xaero': 'X-Aerodynamics',
                          'FF': 'FlightFactor',
                          'JF': 'Just Flight',
                          'AS': 'Aerosoft'
                        };
                        if (devMap[devName]) devName = devMap[devName];

                        if (devName === 'store.x-plane.org' || devName === 'X-Plane Store') {
                           const firstWord = i.title.split(' ')[0];
                           if (firstWord.length > 3 && !['Airbus', 'Boeing', 'Airport', 'Cessna'].includes(firstWord)) {
                             devName = firstWord;
                           }
                        }

                        const typeLower = titleLower;
                        let detectedType = 'aircraft';
                        if (typeLower.includes('scenery') || typeLower.includes('airport') || typeLower.includes('mesh') || typeLower.includes('terrain') || typeLower.includes('ortho') || typeLower.includes('photoreal')) {
                          detectedType = 'scenery';
                        } else if (typeLower.includes('plugin') || typeLower.includes('manager') || typeLower.includes('tool') || typeLower.includes('fmc') || typeLower.includes('walkaround') || typeLower.includes('camera') || typeLower.includes('checklists') || typeLower.includes('panel') || typeLower.includes('passenger')) {
                          detectedType = 'plugin';
                        } else if (typeLower.includes('script') || typeLower.includes('lua') || typeLower.includes('flywithlua')) {
                          detectedType = 'script';
                        } else if (typeLower.includes('utility') || typeLower.includes('helper') || typeLower.includes('configurator') || typeLower.includes('installer')) {
                          detectedType = 'utility';
                        } else if (typeLower.includes('library') || typeLower.includes('lib') || typeLower.includes('shared assets')) {
                          detectedType = 'library';
                        }

                        const smartDesc = detectedType === 'aircraft' ? `High-fidelity aircraft simulation featuring advanced systems and realistic flight dynamics.` :
                                          detectedType === 'scenery' ? `Detailed environmental enhancement featuring high-resolution textures and accurate landmarks.` :
                                          `Professional ${detectedType} enhancement for X-Plane 12, optimizing your flight experience.`;

                        return {
                          id: i.title + i.link,
                          name: productName,
                          price,
                          oldPrice: (oldPrice && oldPrice !== price) ? oldPrice : null,
                          isNew,
                          newLabel,
                          author: devName,
                          description: i.description && i.description.length > 50 ? i.description : smartDesc,
                          source: i.source,
                          type: detectedType,
                          productUrl: i.link,
                          image: i.image,
                          rating: 5.0,
                          popularity: 1000000
                        };
                      })
                    ]
                      .filter(mod => !installedMods.some(inst => inst.id === mod.id))
                      .filter(mod => {
                        // Advanced Filtering Logic
                        const isFree = !mod.price || mod.price === 'Free';
                        const isWished = wishlist.items.some(w => w.link === mod.productUrl || w.link === mod.link);

                        if (filterAddonType === 'wishlist' && !isWished) return false;
                        if (filterAddonType !== 'all' && filterAddonType !== 'wishlist' && filterAddonType !== 'popular' && mod.type.toLowerCase() !== filterAddonType) return false;
                        if (filterPrice === 'free' && !isFree) return false;
                        if (filterPrice === 'paid' && isFree) return false;
                        
                        if (!isFree && mod.price) {
                          const val = parseFloat(mod.price.replace('$', ''));
                          if (!isNaN(val) && val > priceRange[1]) return false;
                        }
                        
                        const searchLower = catalogSearch.toLowerCase();
                        return (
                          mod.name.toLowerCase().includes(searchLower) ||
                          (mod.author && mod.author.toLowerCase().includes(searchLower)) ||
                          (mod.description && mod.description.toLowerCase().includes(searchLower))
                        );
                      })
                      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0)) // Intermix by popularity
                      .slice(0, 48) // Show many more items
                      .map(mod => (
                        <ModCard 
                          key={mod.id} 
                          mod={mod} 
                          isLoggedInOrg={isLoggedInOrg} 
                          isLoggedInTo={isLoggedInTo} 
                          xplanePath={xplanePath} 
                          onInstall={() => loadInstalledMods(xplanePath)} 
                          onDelete={customCatalog.some(c => c.id === mod.id) ? () => handleDeleteCustomAddon(mod) : null}
                          orgCooldown={orgCooldown}
                          setOrgCooldown={setOrgCooldown}
                          installedMods={installedMods}
                          isWished={wishlist.items.some(w => w.link === mod.productUrl || w.link === mod.link)}
                          onToggleWishlist={handleToggleWishlist}
                          progress={downloads[mod.id]}
                        />
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'vault' && (
          <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
            <div style={{ padding: '0 0 15px 0', display: 'flex', gap: '10px' }}>
              <button className="btn btn-primary" onClick={async () => {
                if(window.electronAPI) {
                  for (let m of installedMods) {
                    await window.electronAPI.toggleMod({ vaultPath: xplanePath + '/ModVault', xplanePath, modId: m.id, modType: m.type, enable: true });
                  }
                  loadInstalledMods(xplanePath);
                }
              }}>Enable All</button>
              <button className="btn btn-secondary" onClick={async () => {
                if(window.electronAPI) {
                  for (let m of installedMods) {
                    await window.electronAPI.toggleMod({ vaultPath: xplanePath + '/ModVault', xplanePath, modId: m.id, modType: m.type, enable: false });
                  }
                  loadInstalledMods(xplanePath);
                }
              }}>Disable All</button>
            </div>
            {installedMods.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)' }}>
                You do not have any mods installed. Download mods from the catalog to see them here.
              </div>
            ) : (
              <div className="mod-grid" style={stableGridStyle}>
                {installedMods
                  .filter(mod => {
                    if (vaultFilter === 'all') return true;
                    // Vault doesn't really have trending/popular in the same way, but we can match type
                    if (['trending', 'popular', 'recent'].includes(vaultFilter)) return true; 
                    return mod.type.toLowerCase() === vaultFilter.toLowerCase();
                  })
                  .filter(mod => (mod.name || mod.id).toLowerCase().includes(vaultSearch.toLowerCase()))
                  .map(instMod => (
                    <InstalledModCard 
                      key={instMod.id} 
                      instMod={instMod} 
                      catalog={[...customCatalog, ...catalog]} 
                      xplanePath={xplanePath} 
                      onToggle={() => loadInstalledMods(xplanePath)} 
                      onDelete={() => handleDeleteMod(instMod)}
                      installedMods={installedMods} 
                      progress={downloads[instMod.id]}
                    />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'map' && (
          <div style={{ height: '100%', borderRadius: '16px', overflow: 'hidden', position: 'relative', border: '1px solid var(--panel-border)' }}>
            <MapContainer center={[51.505, -0.09]} zoom={3} style={{ height: '100%', width: '100%', background: '#0b1222' }}>
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              />
              {screenshots.map((shot, idx) => (
                <Marker 
                  key={shot.id || idx} 
                  position={[shot.lat, shot.lng]}
                  eventHandlers={{
                    mouseover: (e) => e.target.openPopup(),
                  }}
                >
                  <Popup className="dark-popup">
                    <div style={{ width: '220px', background: '#1e293b', padding: '5px', borderRadius: '8px' }}>
                      <img 
                        src={getScreenshotUrl(shot)} 
                        alt="Screenshot" 
                        style={{ width: '100%', borderRadius: '6px', border: '1px solid #334155' }}
                        onError={(e) => { e.target.src = 'https://via.placeholder.com/200?text=Image+Not+Found'; }}
                      />
                      <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#f8fafc' }}>
                        <div style={{ fontWeight: 'bold', color: 'var(--accent)', marginBottom: '4px' }}>✈️ {shot.aircraft}</div>
                        <div style={{ color: '#94a3b8' }}>📍 {shot.lat.toFixed(4)}, {shot.lng.toFixed(4)}</div>
                        <div style={{ color: '#94a3b8' }}>🏔️ Alt: {shot.alt || 0} ft</div>
                        <div style={{ color: '#94a3b8' }}>🕒 {new Date(shot.timestamp).toLocaleString()}</div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        )}



        {activeTab === 'news' && (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
            {/* News Filter Sidebar */}
            <div className="glass-panel" style={{ 
              flex: `0 0 ${isFilterVisible ? '240px' : '0px'}`,
              width: isFilterVisible ? '240px' : '0px', 
              margin: isFilterVisible ? '20px 0 20px 20px' : '20px 0 20px 0', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '20px',
              padding: isFilterVisible ? '20px' : '0',
              borderRight: isFilterVisible ? '1px solid var(--panel-border)' : 'none',
              transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
              opacity: isFilterVisible ? 1 : 0,
              overflow: 'hidden',
              position: 'relative',
              willChange: 'flex-basis, width, margin, opacity'
            }}>
              {/* Toggle Arrow */}
              <div 
                onClick={() => setIsFilterVisible(!isFilterVisible)}
                style={{
                  position: 'absolute',
                  right: isFilterVisible ? '-10px' : '-10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '12px',
                  height: '64px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 1000,
                  transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                }}
              >
                <div style={{
                  width: '4px',
                  height: '16px',
                  background: 'var(--accent)',
                  borderRadius: '2px',
                  opacity: 0.8,
                  transition: 'all 0.3s ease',
                  transform: isFilterVisible ? 'rotate(0deg)' : 'rotate(180deg)'
                }} />
              </div>

              {isFilterVisible && (
                <>
                  <h3 style={{ fontSize: '0.9rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px' }}>Feed Filters</h3>
                  
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Content Source</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input 
                          type="radio" 
                          name="newsSource" 
                          checked={filterNewsSource === 'all'} 
                          onChange={() => setFilterNewsSource('all')}
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        All Sources
                      </label>
                      {[...new Set(feed.filter(item => item.type === 'article').map(item => item.source))].sort().map(source => (
                        <label key={source} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.85rem' }}>
                          <input 
                            type="radio" 
                            name="newsSource" 
                            checked={filterNewsSource === source} 
                            onChange={() => setFilterNewsSource(source)}
                            style={{ accentColor: 'var(--accent)' }}
                          />
                          {source.split('.')[0].charAt(0).toUpperCase() + source.split('.')[0].slice(1)}
                        </label>
                      ))}
                    </div>
                  </div>

                  <GlassSelect 
                    label="Filter by Author"
                    value={filterNewsAuthor}
                    onChange={setFilterNewsAuthor}
                    options={[
                      { value: 'all', label: 'All Authors' },
                      ...[...new Set(feed.filter(item => item.type === 'article').map(item => item.author).filter(Boolean))].sort().map(author => ({ value: author, label: author }))
                    ]}
                  />

                  <button 
                    className="btn btn-secondary" 
                    style={{ marginTop: 'auto', fontSize: '0.8rem', padding: '8px' }}
                    onClick={() => {
                      setFilterNewsSource('all');
                      setFilterNewsAuthor('all');
                    }}
                  >
                    Reset Feed
                  </button>
                </>
              )}
            </div>

            <div 
              onClick={() => setIsFilterVisible(!isFilterVisible)}
              style={{
                position: 'absolute',
                left: isFilterVisible ? '260px' : '0px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '32px',
                height: '64px',
                background: 'var(--panel-bg)',
                border: '1px solid var(--panel-border)',
                borderLeft: 'none',
                borderRadius: '0 8px 8px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 1000,
                transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: '4px 0 15px rgba(0,0,0,0.3)',
                color: 'var(--text-secondary)'
              }}
            >
              <span style={{ 
                transform: isFilterVisible ? 'rotate(0deg)' : 'rotate(180deg)', 
                transition: 'transform 0.4s ease' 
              }}>◀</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 className="discovery-section-title" style={{ marginBottom: 0 }}><span>📰</span> Community & News Feed</h2>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                  onClick={loadFeed}
                  disabled={isFetchingFeed}
                >
                  {isFetchingFeed ? '⏳ Refreshing...' : '🔄 Refresh Feed'}
                </button>
              </div>
              <div className="mod-grid" style={stableGridStyle}>
                {isFetchingFeed ? (
                  [...Array(6)].map((_, i) => <div key={i} className="skeleton-card"></div>)
                ) : (
                  feed
                    .filter(item => {
                      if (item.type !== 'article') return false;
                      if (filterNewsSource !== 'all' && item.source !== filterNewsSource) return false;
                      if (filterNewsAuthor !== 'all' && item.author !== filterNewsAuthor) return false;
                      return true;
                    })
                    .map((item, idx) => {
                      const itemId = item.title + item.link;
                      return (
                        <FeedCard 
                          key={itemId} 
                          itemId={itemId}
                          item={item} 
                          isSaved={savedEvents.includes(itemId)}
                          onToggleSaved={handleToggleSaved}
                          isReminded={reminders.includes(itemId)}
                          onToggleReminded={handleToggleReminded}
                          timeMode={timeMode}
                        />
                      );
                    })
                )}
              </div>
            </div>
          </div>
        )}


        {activeTab === 'community' && (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
            {/* Events Filter Sidebar */}
            <div className="glass-panel" style={{ 
              flex: `0 0 ${isFilterVisible ? '240px' : '0px'}`,
              width: isFilterVisible ? '240px' : '0px', 
              margin: isFilterVisible ? '20px 0 20px 20px' : '20px 0 20px 0', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '20px',
              padding: isFilterVisible ? '20px' : '0',
              borderRight: isFilterVisible ? '1px solid var(--panel-border)' : 'none',
              transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
              opacity: isFilterVisible ? 1 : 0,
              overflow: 'hidden',
              position: 'relative',
              willChange: 'flex-basis, width, margin, opacity'
            }}>
              {/* Toggle Arrow */}
              <div 
                onClick={() => setIsFilterVisible(!isFilterVisible)}
                style={{
                  position: 'absolute',
                  right: isFilterVisible ? '-10px' : '-10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '12px',
                  height: '64px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 1000,
                  transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                }}
              >
                <div style={{
                  width: '4px',
                  height: '16px',
                  background: 'var(--accent)',
                  borderRadius: '2px',
                  opacity: 0.8,
                  transition: 'all 0.3s ease',
                  transform: isFilterVisible ? 'rotate(0deg)' : 'rotate(180deg)'
                }} />
              </div>

              {isFilterVisible && (
                <>
                  <h3 style={{ fontSize: '0.9rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px' }}>Event Filters</h3>
                  
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Search Events</label>
                    <input 
                      type="text" 
                      placeholder="Keyword..." 
                      className="path-input" 
                      style={{ width: '100%', fontSize: '0.85rem' }}
                      value={filterEventSearch}
                      onChange={e => setFilterEventSearch(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Network</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {[
                        { id: 'all', name: 'All Networks' },
                        { id: 'vatsim.net', name: 'VATSIM' },
                        { id: 'ivao.aero', name: 'IVAO' },
                        { id: 'simpictures.com', name: 'Gallery' }
                      ].map(n => (
                        <label key={n.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.85rem' }}>
                          <input 
                            type="radio" 
                            name="eventNetwork" 
                            checked={filterEventNetwork === n.id} 
                            onChange={() => setFilterEventNetwork(n.id)}
                            style={{ accentColor: 'var(--accent)' }}
                          />
                          {n.name}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Timeframe</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(() => {
                        const eventItems = feed.filter(i => {
                          if (i.type !== 'media') return false;
                          if (filterEventNetwork !== 'all' && i.source !== filterEventNetwork) return false;
                          if (filterEventSearch && !i.title.toLowerCase().includes(filterEventSearch.toLowerCase()) && !i.description.toLowerCase().includes(filterEventSearch.toLowerCase())) return false;
                          return true;
                        });
                        const now = new Date();
                        const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
                        const nextWeek = new Date(now); nextWeek.setDate(nextWeek.getDate() + 7);
                        const nextMonth = new Date(now); nextMonth.setMonth(nextMonth.getMonth() + 1);

                        const counts = {
                          all: eventItems.length,
                          today: eventItems.filter(i => i.pubDate && new Date(i.pubDate).toDateString() === now.toDateString()).length,
                          tomorrow: eventItems.filter(i => i.pubDate && new Date(i.pubDate).toDateString() === tomorrow.toDateString()).length,
                          week: eventItems.filter(i => i.pubDate && (new Date(i.pubDate) >= now && new Date(i.pubDate) <= nextWeek)).length,
                          month: eventItems.filter(i => i.pubDate && (new Date(i.pubDate) >= now && new Date(i.pubDate) <= nextMonth)).length,
                        };

                        return [
                          { id: 'all', name: 'All Upcoming' },
                          { id: 'today', name: 'Today' },
                          { id: 'tomorrow', name: 'Tomorrow' },
                          { id: 'week', name: 'This Week' },
                          { id: 'month', name: 'This Month' }
                        ].map(t => (
                          <label key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '0.85rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <input 
                                type="radio" 
                                name="eventTime" 
                                checked={filterEventTime === t.id} 
                                onChange={() => setFilterEventTime(t.id)}
                                style={{ accentColor: 'var(--accent)' }}
                              />
                              {t.name}
                            </div>
                            <span style={{ 
                              fontSize: '0.7rem', 
                              background: 'rgba(255,255,255,0.05)', 
                              padding: '2px 6px', 
                              borderRadius: '10px',
                              color: 'var(--text-secondary)',
                              minWidth: '20px',
                              textAlign: 'center'
                            }}>
                              {counts[t.id] || 0}
                            </span>
                          </label>
                        ));
                      })()}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Time Display</label>
                    <div style={{ 
                      display: 'flex', 
                      background: 'rgba(255,255,255,0.05)', 
                      borderRadius: '8px', 
                      padding: '4px',
                      border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                      <button 
                        onClick={() => setTimeMode('UTC')}
                        style={{
                          flex: 1,
                          padding: '6px',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          background: timeMode === 'UTC' ? 'var(--accent)' : 'transparent',
                          color: timeMode === 'UTC' ? 'white' : 'var(--text-secondary)',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        UTC (Z)
                      </button>
                      <button 
                        onClick={() => setTimeMode('Local')}
                        style={{
                          flex: 1,
                          padding: '6px',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          background: timeMode === 'Local' ? 'var(--accent)' : 'transparent',
                          color: timeMode === 'Local' ? 'white' : 'var(--text-secondary)',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        Local
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Filters</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input 
                          type="checkbox" 
                          checked={filterEventSavedOnly} 
                          onChange={e => setFilterEventSavedOnly(e.target.checked)}
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        Starred ⭐
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input 
                          type="checkbox" 
                          checked={filterEventRemindersOnly} 
                          onChange={e => setFilterEventRemindersOnly(e.target.checked)}
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        Scheduled Reminders 🔔
                      </label>
                    </div>
                  </div>

                  <button 
                    className="btn btn-secondary" 
                    style={{ marginTop: 'auto', fontSize: '0.8rem', padding: '8px' }}
                    onClick={() => {
                      setFilterEventNetwork('all');
                      setFilterEventTime('all');
                      setFilterEventSearch('');
                      setFilterEventSavedOnly(false);
                      setFilterEventRemindersOnly(false);
                    }}
                  >
                    Clear Filters
                  </button>
                </>
              )}
            </div>

            <div 
              onClick={() => setIsFilterVisible(!isFilterVisible)}
              style={{
                position: 'absolute',
                left: isFilterVisible ? '260px' : '0px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '32px',
                height: '64px',
                background: 'var(--panel-bg)',
                border: '1px solid var(--panel-border)',
                borderLeft: 'none',
                borderRadius: '0 8px 8px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 1000,
                transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: '4px 0 15px rgba(0,0,0,0.3)',
                color: 'var(--text-secondary)'
              }}
            >
              <span style={{ 
                transform: isFilterVisible ? 'rotate(0deg)' : 'rotate(180deg)', 
                transition: 'transform 0.4s ease' 
              }}>◀</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 className="discovery-section-title" style={{ marginBottom: 0 }}><span>🌍</span> Community Events & Media</h2>
              </div>
              <div className="mod-grid" style={stableGridStyle}>
                {isFetchingFeed ? (
                  [...Array(6)].map((_, i) => <div key={i} className="skeleton-card"></div>)
                ) : (
                  feed
                    .filter(item => {
                      if (item.type !== 'media') return false;
                      
                      // Saved Only Filter
                      if (filterEventSavedOnly && !savedEvents.includes(item.title + item.link)) return false;

                      // Reminders Only Filter
                      if (filterEventRemindersOnly && !reminders.includes(item.title + item.link)) return false;

                      // Network Filter
                      if (filterEventNetwork !== 'all' && item.source !== filterEventNetwork) return false;
                      
                      // Search Filter
                      if (filterEventSearch && !item.title.toLowerCase().includes(filterEventSearch.toLowerCase()) && !item.description.toLowerCase().includes(filterEventSearch.toLowerCase())) return false;
                      
                      // Time Filter
                      if (filterEventTime !== 'all' && item.pubDate) {
                        const eventDate = new Date(item.pubDate);
                        const now = new Date();
                        const tomorrow = new Date(now);
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        const nextWeek = new Date(now);
                        nextWeek.setDate(nextWeek.getDate() + 7);
                        const nextMonth = new Date(now);
                        nextMonth.setMonth(nextMonth.getMonth() + 1);

                        if (filterEventTime === 'today' && eventDate.toDateString() !== now.toDateString()) return false;
                        if (filterEventTime === 'tomorrow' && eventDate.toDateString() !== tomorrow.toDateString()) return false;
                        if (filterEventTime === 'week' && (eventDate < now || eventDate > nextWeek)) return false;
                        if (filterEventTime === 'month' && (eventDate < now || eventDate > nextMonth)) return false;
                      }
                      
                      return true;
                    })
                    .map((item, idx) => {
                      const itemId = item.title + item.link;
                      return (
                        <FeedCard 
                          key={itemId} 
                          itemId={itemId}
                          item={item} 
                          isSaved={savedEvents.includes(itemId)}
                          onToggleSaved={handleToggleSaved}
                          isReminded={reminders.includes(itemId)}
                          onToggleReminded={handleToggleReminded}
                          timeMode={timeMode}
                        />
                      );
                    })
                )}
              </div>
            </div>
          </div>
        )}
        {activeTab === 'modpacks' && (
          <div style={{ color: 'var(--text-secondary)' }}>
            Export your current mod list to a text file, or import an existing one.
            <div style={{ marginTop: 20 }}>
              <button 
                className="btn btn-secondary" 
                style={{ marginRight: 10 }}
                onClick={async () => {
                  let textData = "X-Plane 12 Modpack\n";
                  textData += "-------------------\n";
                  
                  if (window.electronAPI) {
                    const mods = await window.electronAPI.getMods(xplanePath);
                    mods.forEach(m => textData += `- ${m.id}\n`);
                  } else {
                    textData += "- betterpushback\n- zibo737\n";
                  }
                  
                  const blob = new Blob([textData], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'xplane_modpack.txt';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export Modpack
              </button>
              <button className="btn btn-primary" onClick={() => alert("Select a .txt file to install its contents.")}>Import Modpack</button>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div style={{ color: 'var(--text-secondary)', flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Application Settings</h3>
            </div>

            {/* Sub-tabs Navigation */}
            <div style={{ display: 'flex', gap: '10px', background: 'rgba(255,255,255,0.02)', padding: '5px', borderRadius: '12px', border: '1px solid var(--panel-border)', alignSelf: 'flex-start' }}>
              {[
                { id: 'directories', name: 'File Directories', icon: '📂' },
                { id: 'notifications', name: 'Notifications', icon: '🔔' },
                { id: 'screenshots', name: 'Screenshot Settings', icon: '📸' }
              ].map(tab => (
                <button 
                  key={tab.id}
                  onClick={() => setActiveSettingsTab(tab.id)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: activeSettingsTab === tab.id ? 'var(--accent)' : 'transparent',
                    color: activeSettingsTab === tab.id ? 'white' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span>{tab.icon}</span> {tab.name}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', marginTop: '10px' }}>
              {/* Directories Section */}
              {activeSettingsTab === 'directories' && (
                <div style={{ padding: '20px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--panel-border)', animation: 'fadeIn 0.3s ease' }}>
                  <h4 style={{ margin: '0 0 20px 0', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span>📂</span> File Directories
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 'bold' }}>X-Plane 12 Path</label>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <input type="text" value={xplanePath} readOnly className="path-input" style={{ flex: 1, opacity: 0.8 }} />
                        <button className="btn btn-secondary" onClick={() => setIsValidated(false)}>Change Path</button>
                      </div>
                      <p style={{ fontSize: '0.75rem', marginTop: '8px', opacity: 0.6 }}>The root directory where X-Plane 12 is installed.</p>
                    </div>
                    
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 'bold' }}>Addons Vault Path</label>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <input type="text" value={xplanePath ? `${xplanePath}/ModVault` : ''} readOnly className="path-input" style={{ flex: 1, opacity: 0.8 }} />
                        <button className="btn btn-secondary" onClick={async () => {
                          if (window.electronAPI) {
                            const res = await window.electronAPI.openFolder(`${xplanePath}/ModVault`);
                            if (!res.success) alert('Failed to open folder: ' + res.error);
                          }
                        }}>Open Folder</button>
                      </div>
                      <p style={{ fontSize: '0.75rem', marginTop: '8px', opacity: 0.6 }}>Physical storage for original addon files before linking to the simulator.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Notifications Section */}
              {activeSettingsTab === 'notifications' && (
                <div style={{ padding: '20px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--panel-border)', animation: 'fadeIn 0.3s ease' }}>
                  <h4 style={{ margin: '0 0 20px 0', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span>🔔</span> Notifications
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ marginBottom: '10px' }}>
                      <GlassSelect 
                        label="Notification Method"
                        value={wishlist.settings.notificationProvider || 'discord'}
                        options={[
                          { value: 'discord', label: 'Discord Webhook' },
                          { value: 'telegram', label: 'Telegram Bot' },
                          { value: 'email', label: 'Email Notification' }
                        ]}
                        onChange={val => {
                          const newWishlist = { ...wishlist, settings: { ...wishlist.settings, notificationProvider: val } };
                          setWishlist(newWishlist);
                          window.electronAPI.saveWishlist({ xplanePath, wishlist: newWishlist });
                        }}
                      />
                    </div>

                    {wishlist.settings.notificationProvider === 'discord' && (
                      <div className="animate-in">
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 'bold' }}>Discord Webhook URL</label>
                        <input 
                          type="text" 
                          placeholder="https://discord.com/api/webhooks/..." 
                          className="path-input" 
                          style={{ width: '100%' }}
                          value={wishlist.settings.discordWebhook || ''}
                          onChange={e => {
                            const newWishlist = { ...wishlist, settings: { ...wishlist.settings, discordWebhook: e.target.value } };
                            setWishlist(newWishlist);
                            window.electronAPI.saveWishlist({ xplanePath, wishlist: newWishlist });
                          }}
                        />
                        <p style={{ fontSize: '0.7rem', marginTop: '6px', opacity: 0.6 }}>Create a webhook in your Discord server settings to receive alerts.</p>
                      </div>
                    )}

                    {wishlist.settings.notificationProvider === 'telegram' && (
                      <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 'bold' }}>Telegram Bot Token</label>
                          <input 
                            type="text" 
                            placeholder="123456:ABC-DEF..." 
                            className="path-input" 
                            style={{ width: '100%' }}
                            value={wishlist.settings.telegramBotToken || ''}
                            onChange={e => {
                              const newWishlist = { ...wishlist, settings: { ...wishlist.settings, telegramBotToken: e.target.value } };
                              setWishlist(newWishlist);
                              window.electronAPI.saveWishlist({ xplanePath, wishlist: newWishlist });
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 'bold' }}>Telegram Chat ID</label>
                          <input 
                            type="text" 
                            placeholder="e.g. 123456789" 
                            className="path-input" 
                            style={{ width: '100%' }}
                            value={wishlist.settings.telegramChatId || ''}
                            onChange={e => {
                              const newWishlist = { ...wishlist, settings: { ...wishlist.settings, telegramChatId: e.target.value } };
                              setWishlist(newWishlist);
                              window.electronAPI.saveWishlist({ xplanePath, wishlist: newWishlist });
                            }}
                          />
                        </div>
                        <p style={{ fontSize: '0.7rem', opacity: 0.6 }}>Use @BotFather to create a bot and @userinfobot to find your Chat ID.</p>
                      </div>
                    )}

                    {wishlist.settings.notificationProvider === 'email' && (
                      <div className="animate-in">
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 'bold' }}>Email Address</label>
                        <input 
                          type="email" 
                          placeholder="your@email.com" 
                          className="path-input" 
                          style={{ width: '100%' }}
                          value={wishlist.settings.emailRecipient || ''}
                          onChange={e => {
                            const newWishlist = { ...wishlist, settings: { ...wishlist.settings, emailRecipient: e.target.value } };
                            setWishlist(newWishlist);
                            window.electronAPI.saveWishlist({ xplanePath, wishlist: newWishlist });
                          }}
                        />
                      </div>
                    )}

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '20px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 'bold' }}>Check Interval</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input 
                          type="number" 
                          min="1" 
                          className="path-input" 
                          style={{ width: '80px' }}
                          value={wishlist.settings.checkIntervalHours || 6}
                          onChange={e => {
                            const newWishlist = { ...wishlist, settings: { ...wishlist.settings, checkIntervalHours: parseInt(e.target.value) } };
                            setWishlist(newWishlist);
                            window.electronAPI.saveWishlist({ xplanePath, wishlist: newWishlist });
                            window.electronAPI.startWishlistMonitor(xplanePath);
                          }}
                        />
                        <span style={{ fontSize: '0.85rem' }}>Hours</span>
                      </div>
                      <p style={{ fontSize: '0.75rem', marginTop: '8px', opacity: 0.6 }}>How often the background service checks for price updates.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Screenshots Section */}
              {activeSettingsTab === 'screenshots' && (
                <div style={{ padding: '20px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--panel-border)', animation: 'fadeIn 0.3s ease' }}>
                  <h4 style={{ margin: '0 0 20px 0', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span>📸</span> Screenshot Settings
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '10px', fontSize: '0.85rem', fontWeight: 'bold' }}>Auto-Sync Screenshots</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div 
                          style={{ 
                            width: '40px', height: '20px', background: 'var(--accent)', borderRadius: '10px', position: 'relative', cursor: 'pointer' 
                          }}
                        >
                          <div style={{ width: '16px', height: '16px', background: 'white', borderRadius: '50%', position: 'absolute', right: '2px', top: '2px' }} />
                        </div>
                        <span style={{ fontSize: '0.85rem' }}>Automatically detect and import game screenshots</span>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '20px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 'bold' }}>Global Hotkey (Press keys to record)</label>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <input 
                          type="text" 
                          className="path-input" 
                          style={{ flex: 1 }}
                          value={hotkey} 
                          readOnly
                          onKeyDown={(e) => {
                            e.preventDefault();
                            const keys = [];
                            if (e.ctrlKey) keys.push('Ctrl');
                            if (e.altKey) keys.push('Alt');
                            if (e.shiftKey) keys.push('Shift');
                            if (e.metaKey) keys.push('Command');
                            
                            const mainKey = e.key.toUpperCase()
                              .replace('CONTROL', '')
                              .replace('SHIFT', '')
                              .replace('ALT', '')
                              .replace('META', '')
                              .trim();
                              
                            if (mainKey) keys.push(mainKey);
                            
                            if (keys.length > 0) {
                              setHotkey(keys.join('+'));
                            }
                          }}
                          placeholder="Click and press keys..."
                        />
                        <button className="btn btn-secondary" onClick={() => setHotkey('Ctrl+Shift+S')}>Default</button>
                      </div>
                      <p style={{ fontSize: '0.75rem', marginTop: '8px', opacity: 0.6 }}>Use this hotkey inside X-Plane to capture a geo-tagged screenshot.</p>
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 'bold' }}>Storage Folder (Optional)</label>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <input 
                          type="text" 
                          className="path-input" 
                          style={{ flex: 1 }}
                          value={customSPath} 
                          readOnly
                          placeholder="Default: X-Plane/Assistant_Screenshots"
                        />
                        <button className="btn btn-secondary" onClick={async () => {
                          if (window.electronAPI) {
                            const path = await window.electronAPI.selectDirectory();
                            if (path) setCustomSPath(path);
                          }
                        }}>Browse</button>
                        {customSPath && <button className="btn btn-secondary" onClick={() => setCustomSPath('')}>Reset</button>}
                      </div>
                    </div>

                    <button 
                      className="btn btn-primary" 
                      style={{ marginTop: '10px', width: '200px', alignSelf: 'flex-start' }}
                      onClick={async () => {
                        if (window.electronAPI) {
                          const normalizedHotkey = hotkey.replace('Ctrl', 'Control');
                          await window.electronAPI.updateScreenshotSettings({ 
                            hotkey: normalizedHotkey, 
                            xplanePath, 
                            customPath: customSPath || null 
                          });
                          localStorage.setItem('screenshotHotkey', hotkey);
                          localStorage.setItem('customSPath', customSPath);
                          alert('Screenshot settings saved and applied!');
                          loadScreenshots();
                        }
                      }}
                    >
                      💾 Save & Apply Hotkey
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ModCard({ mod, isLoggedInOrg, isLoggedInTo, xplanePath, onInstall, onDelete, orgCooldown, setOrgCooldown, installedMods, isWished, onToggleWishlist, progress }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const hasFlyWithLua = installedMods && installedMods.some(m => m.id === 'flywithlua');
  let canDownload = !mod.requiresAuth;
  if (mod.requiresAuth) {
    if (mod.source === 'X-Plane.org' && isLoggedInOrg) canDownload = true;
    if (mod.source === 'X-Plane.to' && isLoggedInTo) canDownload = true;
  }

  const isOrgCooldown = mod.source === 'X-Plane.org' && orgCooldown > 0;
  
  const handleDownload = async () => {
    if (isOrgCooldown) return;
    setIsDownloading(true);
    if (mod.source === 'X-Plane.org') setOrgCooldown(15);

    try {
      if (window.electronAPI) {
        const isInteractive = mod.source === 'X-Plane.org' || mod.source === 'X-Plane.to' || mod.source === 'Cloud Storage' || mod.source === 'Website' || mod.source === 'SimHeaven';
        const result = isInteractive 
          ? await window.electronAPI.downloadInteractive({
              url: mod.productUrl || mod.url,
              xplanePath, modId: mod.id, modType: mod.type, name: mod.name
            })
          : await window.electronAPI.downloadAndInstallMod({
              url: mod.url,
              xplanePath, modId: mod.id, modType: mod.type,
              requiresAuth: mod.requiresAuth, source: mod.source, name: mod.name
            });

        if (result.success) {
          alert(`${mod.name} installed successfully!`);
          if (onInstall) onInstall();
        } else {
          alert(`Failed to install: ${result.error}`);
        }
      } else {
        await new Promise(res => setTimeout(res, 2000));
        alert(`[Browser Simulation] ${mod.name} downloaded!`);
        if (onInstall) onInstall();
      }
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setIsDownloading(false);
    }
  };

  const isFree = !mod.price || mod.price === 'Free';

  return (
    <div className="glass-panel feed-card-premium animate-in" style={{ 
      padding: '0', 
      overflow: 'hidden', 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
      transition: 'transform 0.3s ease, box-shadow 0.3s ease',
      position: 'relative'
    }}>
      {progress && progress.progress > 0 && progress.progress < 100 && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: '4px',
          width: `${progress.progress}%`,
          background: progress.stage === 'extracting' ? 'var(--warning)' : progress.stage === 'enabling' ? 'var(--success)' : 'var(--accent)',
          boxShadow: `0 0 10px ${progress.stage === 'extracting' ? 'var(--warning)' : 'var(--accent)'}`,
          zIndex: 100,
          transition: 'width 0.3s ease'
        }} />
      )}
      {!isFree && (
        <div style={{ position: 'relative', height: '160px', overflow: 'hidden' }}>
          {mod.image ? (
            <img src={mod.image} alt={mod.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', background: 'linear-gradient(135deg, rgba(170, 59, 255, 0.1), rgba(59, 130, 246, 0.1))' }}>
              {mod.type === 'aircraft' ? '✈️' : mod.type === 'scenery' ? '⛰️' : mod.type === 'library' ? '📚' : '🔌'}
            </div>
          )}
          
          {/* Dynamic Ribbons */}
          {mod.oldPrice && (
            <div style={{
              position: 'absolute', top: '15px', right: '-35px',
              background: '#ef4444', color: 'white', padding: '4px 40px',
              fontSize: '0.7rem', fontWeight: 'bold', transform: 'rotate(45deg)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.5)', zIndex: 10
            }}>
              SALE -{Math.round((1 - parseFloat(mod.price.replace('$', '')) / parseFloat(mod.oldPrice.replace('$', ''))) * 100)}%
            </div>
          )}
          
          {mod.isNew && !mod.oldPrice && (
            <div style={{
              position: 'absolute', top: '15px', right: '-35px',
              background: '#fbbf24', color: '#000', padding: '4px 40px',
              fontSize: '0.7rem', fontWeight: 'bold', transform: 'rotate(45deg)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.5)', zIndex: 10
            }}>
              {mod.newLabel}
            </div>
          )}

          <div style={{ 
            position: 'absolute', top: '12px', left: '12px', 
            background: 'var(--accent)', padding: '4px 10px', borderRadius: '20px', 
            fontSize: '0.6rem', fontWeight: 'bold', color: 'white',
            textTransform: 'uppercase', letterSpacing: '1px', boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
          }}>
            {mod.source}
          </div>

          <button 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleWishlist(mod);
            }}
            style={{
              position: 'absolute', top: '12px', right: '12px',
              background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%',
              width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: isWished ? '#ef4444' : 'white',
              backdropFilter: 'blur(8px)', transition: 'all 0.3s ease', zIndex: 20
            }}
          >
            {isWished ? '❤️' : '🤍'}
          </button>
        </div>
      )}

      <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
            <div className="mod-title" style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-primary)', lineHeight: '1.2', flex: 1 }}>
              {mod.name}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
            <div className="mod-author" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', opacity: 0.8 }}>
              by <span style={{ color: 'var(--text-primary)' }}>{mod.author}</span>
            </div>
            <span className="mod-badge" style={{ fontSize: '0.65rem', padding: '2px 8px', background: 'rgba(255,255,255,0.08)' }}>
              {mod.type?.toUpperCase()}
            </span>
          </div>
          {isFree && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px', opacity: 0.7 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ color: 'var(--accent)' }}>🌐</span> {mod.source}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ color: 'var(--accent)' }}>🎮</span> 
                {((mod.name + mod.description).includes('XP11') && (mod.name + mod.description).includes('XP12')) ? 'XP11/12' : 
                 ((mod.name + mod.description).includes('XP11') ? 'XP11' : 'XP12')}
              </span>
              {mod.downloads && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: 'var(--accent)' }}>📥</span> {mod.downloads.toLocaleString()}
                </span>
              )}
              {mod.rating > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: '#fbbf24' }}>★</span> {mod.rating}
                </span>
              )}
            </div>
          )}
        </div>
        
        <div className="mod-desc" style={{ 
          fontSize: '0.82rem', 
          color: 'var(--text-secondary)', 
          lineHeight: '1.4',
          display: '-webkit-box', 
          WebkitLineClamp: '2', 
          WebkitBoxOrient: 'vertical', 
          overflow: 'hidden',
          minHeight: '2.4em'
        }}>
          {mod.description}
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {mod.oldPrice && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textDecoration: 'line-through', opacity: 0.6, marginBottom: '-2px' }}>
                {mod.oldPrice}
              </span>
            )}
            <span style={{ 
              fontSize: isFree ? '0.8rem' : '1.15rem', 
              fontWeight: isFree ? '500' : '800', 
              color: (isFree || mod.oldPrice) ? '#10b981' : 'var(--accent)',
              textShadow: (isFree || mod.oldPrice) ? '0 0 15px rgba(16, 185, 129, 0.3)' : '0 0 15px rgba(170, 59, 255, 0.3)',
              padding: isFree ? '4px 10px' : '0',
              background: isFree ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
              borderRadius: isFree ? '6px' : '0',
              textTransform: isFree ? 'none' : 'uppercase'
            }}>
              {isFree ? 'Freeware' : mod.price}
            </span>
          </div>

          <div className="mod-actions" style={{ display: 'flex', gap: '8px' }}>
            {onDelete && (
              <button 
                className="btn btn-secondary" 
                onClick={onDelete}
                style={{ padding: '0 10px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                title="Remove from Catalog"
              >🗑️</button>
            )}
            {isFree ? (
              <button 
                className="btn btn-primary" 
                disabled={!canDownload || isDownloading || isOrgCooldown} 
                onClick={handleDownload}
                style={{ 
                  padding: '8px 20px', 
                  fontSize: '0.85rem', 
                  fontWeight: 'bold',
                  boxShadow: isDownloading ? 'none' : '0 4px 15px rgba(170, 59, 255, 0.3)'
                }}
              >
                {isDownloading ? (
                  progress ? (
                    progress.stage === 'extracting' ? 'Unpacking...' :
                    progress.stage === 'enabling' ? 'Activating...' :
                    `${progress.progress}%`
                  ) : '...'
                ) : isOrgCooldown ? `${orgCooldown}s` : (canDownload ? 'Install' : 'Login')}
              </button>
            ) : (
              <a 
                href={mod.productUrl || '#'} 
                target="_blank" 
                rel="noreferrer"
                className="btn btn-primary" 
                style={{ 
                  padding: '8px 20px', 
                  fontSize: '0.85rem', 
                  fontWeight: 'bold',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 15px rgba(170, 59, 255, 0.3)'
                }}
              >
                Purchase
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InstalledModCard({ instMod, catalog, xplanePath, onToggle, onDelete, installedMods, progress }) {
  const catalogMod = catalog.find(m => m.id === instMod.id) || {};
  const mod = { ...catalogMod, ...instMod };
  const hasFlyWithLua = installedMods && installedMods.some(m => m.id === 'flywithlua');
  
  const [isToggling, setIsToggling] = useState(false);
  
  const handleToggle = async (enable) => {
    setIsToggling(true);
    if (window.electronAPI) {
      const result = await window.electronAPI.toggleMod({
        vaultPath: xplanePath + '/ModVault',
        xplanePath,
        modId: mod.id,
        modType: mod.type,
        enable,
        isManaged: mod.isManaged
      });
      if (result && !result.success) {
        alert(`Failed to toggle mod: ${result.error}`);
      }
      if (onToggle) onToggle();
    }
    setIsToggling(false);
  };

  return (
    <div className="glass-panel mod-card" style={{ padding: '20px', position: 'relative' }}>
      {progress && progress.progress > 0 && progress.progress < 100 && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: '4px',
          width: `${progress.progress}%`,
          background: progress.stage === 'extracting' ? 'var(--warning)' : progress.stage === 'enabling' ? 'var(--success)' : 'var(--accent)',
          boxShadow: `0 0 10px ${progress.stage === 'extracting' ? 'var(--warning)' : 'var(--accent)'}`,
          zIndex: 100,
          transition: 'width 0.3s ease'
        }} />
      )}
      <div className="mod-header" style={{ alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="status-dot" style={{ 
            width: '12px', 
            height: '12px', 
            borderRadius: '50%', 
            background: mod.enabled ? 'var(--success)' : 'var(--danger)',
            boxShadow: `0 0 8px ${mod.enabled ? 'var(--success)' : 'var(--danger)'}`,
            flexShrink: 0
          }} />
          <div className="mod-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: '700', fontSize: '1.2rem' }}>
              {mod.name || mod.id}
            </span>
            {mod.productUrl && (
              <a 
                href={mod.productUrl} 
                target="_blank" 
                rel="noreferrer" 
                title="Visit Product Page"
                style={{ flexShrink: 0, color: 'var(--accent)', textDecoration: 'none', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}
              >
                ?
              </a>
            )}
          </div>
        </div>
      </div>

      {mod.author && (
        <div className="mod-author" style={{ marginBottom: '10px', fontSize: '0.9rem' }}>
          by <a href={mod.authorUrl || '#'} target="_blank" rel="noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>{mod.author}</a>
        </div>
      )}

      {(mod.description || instMod.description) && (
        <div className="mod-desc" style={{ marginBottom: '15px', fontSize: '0.9rem', color: 'var(--text-secondary)', minHeight: '3em' }}>
          {mod.description || instMod.description}
        </div>
      )}

      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: '12px', 
        fontSize: '0.8rem', 
        color: 'var(--text-secondary)', 
        borderTop: '1px solid var(--panel-border)', 
        paddingTop: '12px',
        marginBottom: '15px'
      }}>
        <span className="mod-badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}>{mod.type?.toUpperCase()}</span>
        
        {mod.source && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            🌐 {mod.source.replace('X-Plane.', '')}
          </span>
        )}

        {(mod.version || instMod.version) && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            📦 v{mod.version || instMod.version}
          </span>
        )}

        {(mod.size || instMod.size) && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            💾 {mod.size || instMod.size}
          </span>
        )}

        {mod.versions && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--success)' }}>
            ✈️ XP {mod.versions.join('/')}
          </span>
        )}

        {mod.type === 'script' && (
          <span style={{ color: hasFlyWithLua ? 'var(--success)' : 'var(--danger)', fontWeight: 'bold' }}>
            {hasFlyWithLua ? '✓ Lua OK' : '! No Lua'}
          </span>
        )}
      </div>
      <div className="mod-actions" style={{ marginTop: 'auto', display: 'flex', gap: '10px' }}>
        <button 
          className={`btn ${mod.enabled ? 'btn-secondary' : 'btn-primary'}`} 
          style={{ flex: 1 }}
          disabled={isToggling}
          onClick={() => handleToggle(!mod.enabled)}
        >
          {isToggling ? 'Wait...' : (mod.enabled ? 'Disable' : 'Enable')}
        </button>
        <button 
          className="btn btn-secondary" 
          onClick={() => { if(window.confirm('Are you sure you want to delete this mod?')) onDelete(); }}
          style={{ padding: '0 12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
          title="Delete & Uninstall"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

export default App;
