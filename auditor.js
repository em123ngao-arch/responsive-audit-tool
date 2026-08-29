/**
 * auditor.js - Responsive Design Analysis Engine
 * 
 * Contains all the logic for analyzing a website's responsive design
 * across multiple viewport sizes.
 */

const VIEWPORTS = [
  { name: 'iPhone SE', width: 375, height: 667, category: 'Mobile S', icon: '📱' },
  { name: 'iPhone 14 Pro', width: 393, height: 852, category: 'Mobile M', icon: '📱' },
  { name: 'iPad Mini', width: 768, height: 1024, category: 'Tablet', icon: '📋' },
  { name: 'iPad Pro', width: 1024, height: 1366, category: 'Tablet L', icon: '📋' },
  { name: 'Laptop', width: 1366, height: 768, category: 'Desktop', icon: '💻' },
  { name: 'Desktop HD', width: 1920, height: 1080, category: 'Desktop L', icon: '🖥️' },
];

const CRITERIA_WEIGHTS = {
  viewportMeta: 0.10,
  mediaQueries: 0.10,
  layoutOverflow: 0.12,
  fontResponsiveness: 0.08,
  imageResponsiveness: 0.10,
  touchTargets: 0.08,
  contentReflow: 0.10,
  navigationResponsive: 0.08,
  viewportUnits: 0.06,
  flexboxGridUsage: 0.08,
  performanceMobile: 0.05,
  textReadability: 0.05,
};

/**
 * Main audit function - runs the full responsive analysis
 */
async function runAudit(browser, url) {
  const results = {
    url,
    timestamp: new Date().toISOString(),
    viewports: [],
    criteria: {},
    overallScore: 0,
    grade: '',
    recommendations: [],
  };

  // First pass: collect data from all viewports
  const viewportData = [];
  for (const vp of VIEWPORTS) {
    try {
      const data = await analyzeViewport(browser, url, vp);
      viewportData.push(data);
      results.viewports.push({
        ...vp,
        screenshot: data.screenshot,
        loadTime: data.loadTime,
        hasOverflow: data.hasOverflow,
      });
    } catch (err) {
      console.error(`Error analyzing viewport ${vp.name}:`, err.message);
      results.viewports.push({
        ...vp,
        screenshot: null,
        loadTime: null,
        hasOverflow: null,
        error: err.message,
      });
    }
  }

  // Second pass: evaluate criteria
  if (viewportData.length > 0) {
    results.criteria = evaluateAllCriteria(viewportData);
    results.overallScore = calculateOverallScore(results.criteria);
    results.grade = getGrade(results.overallScore);
    results.recommendations = generateRecommendations(results.criteria, viewportData);
  } else {
    throw new Error('Không thể truy cập hoặc render trang web. Vui lòng kiểm tra lại URL hoặc thử website khác.');
  }

  return results;
}

/**
 * Analyze a single viewport
 */
async function analyzeViewport(browser, url, viewport) {
  const page = await browser.newPage();
  
  try {
    // Set modern User-Agent to avoid antibot blocks
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    await page.setViewport({
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1, // 1 for high performance and low memory
      isMobile: viewport.category.startsWith('Mobile'),
      hasTouch: viewport.category !== 'Desktop' && viewport.category !== 'Desktop L',
    });

    const startTime = Date.now();
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
    } catch (e) {
      // If domcontentloaded fails or times out, try continuing if page has content
      console.warn(`Warning loading ${viewport.name}:`, e.message);
    }

    const loadTime = Date.now() - startTime;

    // Small delay for CSS layout settle
    await new Promise(r => setTimeout(r, 400));

    // Take screenshot
    const screenshot = await page.screenshot({
      encoding: 'base64',
      fullPage: false,
      type: 'webp',
      quality: 70,
    });

    // Run DOM analysis
    const analysis = await page.evaluate((vpWidth) => {
      const result = {
        // Viewport meta
        viewportMeta: null,
        
        // Media queries
        mediaQueries: [],
        
        // Overflow
        hasOverflow: false,
        overflowElements: [],
        
        // Font sizes
        fontSizes: [],
        minFontSize: Infinity,
        
        // Touch targets
        touchTargets: { total: 0, tooSmall: 0, elements: [] },
        
        // Images
        images: { total: 0, responsive: 0, withSrcset: 0, withPicture: 0, oversized: 0, details: [] },
        
        // Layout
        layout: { usesFlexbox: false, usesGrid: false, flexCount: 0, gridCount: 0 },
        
        // Navigation
        navigation: { hasNav: false, hasHamburger: false, navVisible: true, navType: 'unknown' },
        
        // Viewport units usage
        viewportUnits: { usesVw: false, usesVh: false, usesRem: false, usesPercent: false, hardcodedPx: 0 },
        
        // Text readability
        textReadability: { totalElements: 0, readableElements: 0, smallTextElements: [] },
      };

      // 1. Check viewport meta
      const metaViewport = document.querySelector('meta[name="viewport"]');
      if (metaViewport) {
        result.viewportMeta = {
          exists: true,
          content: metaViewport.getAttribute('content'),
          hasWidth: /width\s*=/.test(metaViewport.getAttribute('content') || ''),
          hasInitialScale: /initial-scale\s*=/.test(metaViewport.getAttribute('content') || ''),
          isCorrect: /width\s*=\s*device-width/.test(metaViewport.getAttribute('content') || ''),
        };
      } else {
        result.viewportMeta = { exists: false, content: null, hasWidth: false, hasInitialScale: false, isCorrect: false };
      }

      // 2. Check media queries from stylesheets
      try {
        for (const sheet of document.styleSheets) {
          try {
            const rules = sheet.cssRules || sheet.rules;
            if (!rules) continue;
            for (const rule of rules) {
              if (rule.type === CSSRule.MEDIA_RULE) {
                result.mediaQueries.push(rule.conditionText || rule.media?.mediaText || '');
              }
            }
          } catch (e) {
            // Cross-origin stylesheet, skip
          }
        }
      } catch (e) {}

      // 3. Check overflow
      const docWidth = document.documentElement.scrollWidth;
      const viewportWidth = window.innerWidth;
      result.hasOverflow = docWidth > viewportWidth + 5;
      
      if (result.hasOverflow) {
        // Find overflow elements
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          const rect = el.getBoundingClientRect();
          if (rect.right > viewportWidth + 5 && rect.width > 0) {
            result.overflowElements.push({
              tag: el.tagName.toLowerCase(),
              class: el.className?.toString()?.substring(0, 50) || '',
              width: Math.round(rect.width),
              right: Math.round(rect.right),
            });
            if (result.overflowElements.length >= 5) break;
          }
        }
      }

      // 4. Check font sizes
      const textElements = document.querySelectorAll('p, span, a, li, td, th, label, h1, h2, h3, h4, h5, h6, div, button');
      for (const el of textElements) {
        if (el.textContent?.trim()?.length > 0 && el.offsetHeight > 0) {
          const style = window.getComputedStyle(el);
          const fontSize = parseFloat(style.fontSize);
          if (!isNaN(fontSize)) {
            result.fontSizes.push(fontSize);
            if (fontSize < result.minFontSize) result.minFontSize = fontSize;
          }
        }
      }
      if (result.minFontSize === Infinity) result.minFontSize = 0;

      // 5. Check touch targets
      const interactiveElements = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [onclick]');
      result.touchTargets.total = interactiveElements.length;
      for (const el of interactiveElements) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          if (rect.width < 44 || rect.height < 44) {
            result.touchTargets.tooSmall++;
            if (result.touchTargets.elements.length < 5) {
              result.touchTargets.elements.push({
                tag: el.tagName.toLowerCase(),
                text: el.textContent?.trim()?.substring(0, 30) || '',
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              });
            }
          }
        }
      }

      // 6. Check images
      const images = document.querySelectorAll('img');
      result.images.total = images.length;
      for (const img of images) {
        const hasMaxWidth = window.getComputedStyle(img).maxWidth !== 'none';
        const hasSrcset = img.hasAttribute('srcset');
        const isInPicture = img.parentElement?.tagName === 'PICTURE';
        const isResponsive = hasMaxWidth || parseFloat(window.getComputedStyle(img).width) <= vpWidth;
        
        if (isResponsive) result.images.responsive++;
        if (hasSrcset) result.images.withSrcset++;
        if (isInPicture) result.images.withPicture++;
        
        const naturalWidth = img.naturalWidth;
        const displayWidth = img.getBoundingClientRect().width;
        if (naturalWidth > 0 && displayWidth > 0 && naturalWidth > displayWidth * 2) {
          result.images.oversized++;
        }
      }

      // 7. Check layout (Flexbox/Grid)
      const allEls = document.querySelectorAll('*');
      for (const el of allEls) {
        const display = window.getComputedStyle(el).display;
        if (display === 'flex' || display === 'inline-flex') {
          result.layout.usesFlexbox = true;
          result.layout.flexCount++;
        }
        if (display === 'grid' || display === 'inline-grid') {
          result.layout.usesGrid = true;
          result.layout.gridCount++;
        }
      }

      // 8. Check navigation
      const nav = document.querySelector('nav, [role="navigation"], header');
      if (nav) {
        result.navigation.hasNav = true;
        const hamburger = document.querySelector(
          '[class*="hamburger"], [class*="menu-toggle"], [class*="nav-toggle"], ' +
          '[class*="mobile-menu"], [aria-label*="menu"], [class*="burger"], ' +
          'button[class*="menu"], .navbar-toggler, #nav-toggle'
        );
        result.navigation.hasHamburger = !!hamburger;
        
        const navStyle = window.getComputedStyle(nav);
        result.navigation.navVisible = navStyle.display !== 'none' && navStyle.visibility !== 'hidden';
      }

      // 9. Check viewport units usage in inline styles and computed styles
      try {
        for (const sheet of document.styleSheets) {
          try {
            const cssText = Array.from(sheet.cssRules || []).map(r => r.cssText).join(' ');
            if (/\d+vw/.test(cssText)) result.viewportUnits.usesVw = true;
            if (/\d+vh/.test(cssText)) result.viewportUnits.usesVh = true;
            if (/\d+rem/.test(cssText)) result.viewportUnits.usesRem = true;
            if (/\d+%/.test(cssText)) result.viewportUnits.usesPercent = true;
            // Count hardcoded px in width/height declarations
            const pxMatches = cssText.match(/(?:width|height|margin|padding|left|right|top|bottom)\s*:\s*\d+px/g);
            if (pxMatches) result.viewportUnits.hardcodedPx += pxMatches.length;
          } catch (e) {}
        }
      } catch (e) {}

      // 10. Text readability
      const readableEls = document.querySelectorAll('p, li, span, a, td, th, label');
      for (const el of readableEls) {
        if (el.textContent?.trim()?.length > 5 && el.offsetHeight > 0) {
          result.textReadability.totalElements++;
          const fs = parseFloat(window.getComputedStyle(el).fontSize);
          if (fs >= 14) {
            result.textReadability.readableElements++;
          } else if (result.textReadability.smallTextElements.length < 5) {
            result.textReadability.smallTextElements.push({
              tag: el.tagName.toLowerCase(),
              text: el.textContent.trim().substring(0, 40),
              fontSize: Math.round(fs * 10) / 10,
            });
          }
        }
      }

      return result;
    }, viewport.width);

    return {
      viewport,
      screenshot: `data:image/webp;base64,${screenshot}`,
      loadTime,
      ...analysis,
    };
  } finally {
    await page.close();
  }
}

/**
 * Evaluate all 12 criteria from collected viewport data
 */
function evaluateAllCriteria(viewportData) {
  const criteria = {};

  // 1. Viewport Meta Tag
  const metaData = viewportData[0]?.viewportMeta;
  criteria.viewportMeta = {
    name: 'Viewport Meta Tag',
    icon: '🏷️',
    score: 0,
    status: 'fail',
    details: '',
    issues: [],
  };
  if (metaData?.exists && metaData?.isCorrect && metaData?.hasInitialScale) {
    criteria.viewportMeta.score = 100;
    criteria.viewportMeta.status = 'pass';
    criteria.viewportMeta.details = `Meta viewport đúng chuẩn: ${metaData.content}`;
  } else if (metaData?.exists && metaData?.isCorrect) {
    criteria.viewportMeta.score = 80;
    criteria.viewportMeta.status = 'pass';
    criteria.viewportMeta.details = `Meta viewport có nhưng thiếu initial-scale`;
    criteria.viewportMeta.issues.push('Thêm initial-scale=1 vào viewport meta tag');
  } else if (metaData?.exists) {
    criteria.viewportMeta.score = 40;
    criteria.viewportMeta.status = 'warn';
    criteria.viewportMeta.details = `Meta viewport có nhưng không đúng chuẩn: ${metaData.content}`;
    criteria.viewportMeta.issues.push('Sửa viewport meta thành: <meta name="viewport" content="width=device-width, initial-scale=1">');
  } else {
    criteria.viewportMeta.score = 0;
    criteria.viewportMeta.status = 'fail';
    criteria.viewportMeta.details = 'Không tìm thấy meta viewport tag';
    criteria.viewportMeta.issues.push('Thêm: <meta name="viewport" content="width=device-width, initial-scale=1">');
  }

  // 2. Media Queries
  const allMediaQueries = [...new Set(viewportData.flatMap(d => d.mediaQueries || []))];
  const responsiveQueries = allMediaQueries.filter(q =>
    /min-width|max-width|min-device-width|max-device-width/.test(q)
  );
  criteria.mediaQueries = {
    name: 'Media Queries',
    icon: '📐',
    score: 0,
    status: 'fail',
    details: '',
    issues: [],
  };
  if (responsiveQueries.length >= 4) {
    criteria.mediaQueries.score = 100;
    criteria.mediaQueries.status = 'pass';
    criteria.mediaQueries.details = `${responsiveQueries.length} responsive breakpoints phát hiện`;
  } else if (responsiveQueries.length >= 2) {
    criteria.mediaQueries.score = 70;
    criteria.mediaQueries.status = 'warn';
    criteria.mediaQueries.details = `Chỉ có ${responsiveQueries.length} breakpoints, nên có ít nhất 4`;
    criteria.mediaQueries.issues.push('Thêm breakpoints cho: mobile (375px), tablet (768px), desktop (1024px), large desktop (1440px)');
  } else if (responsiveQueries.length >= 1) {
    criteria.mediaQueries.score = 40;
    criteria.mediaQueries.status = 'warn';
    criteria.mediaQueries.details = `Chỉ có ${responsiveQueries.length} breakpoint`;
    criteria.mediaQueries.issues.push('Cần thêm nhiều breakpoints hơn cho các kích thước thiết bị phổ biến');
  } else {
    criteria.mediaQueries.score = 0;
    criteria.mediaQueries.status = 'fail';
    criteria.mediaQueries.details = 'Không phát hiện media queries responsive nào';
    criteria.mediaQueries.issues.push('Thêm CSS media queries để điều chỉnh layout theo kích thước màn hình');
  }

  // 3. Layout Overflow
  const mobileViewports = viewportData.filter(d => d.viewport?.category?.startsWith('Mobile'));
  const tabletViewports = viewportData.filter(d => d.viewport?.category?.startsWith('Tablet'));
  const overflowMobile = mobileViewports.filter(d => d.hasOverflow).length;
  const overflowTablet = tabletViewports.filter(d => d.hasOverflow).length;
  const overflowTotal = viewportData.filter(d => d.hasOverflow).length;

  criteria.layoutOverflow = {
    name: 'Layout Overflow',
    icon: '📏',
    score: 0,
    status: 'fail',
    details: '',
    issues: [],
  };
  if (overflowTotal === 0) {
    criteria.layoutOverflow.score = 100;
    criteria.layoutOverflow.status = 'pass';
    criteria.layoutOverflow.details = 'Không có horizontal overflow ở bất kỳ viewport nào';
  } else if (overflowMobile === 0 && overflowTablet === 0) {
    criteria.layoutOverflow.score = 80;
    criteria.layoutOverflow.status = 'pass';
    criteria.layoutOverflow.details = `Overflow phát hiện ở ${overflowTotal} viewport(s) desktop`;
  } else {
    const penalty = overflowTotal * 25;
    criteria.layoutOverflow.score = Math.max(0, 100 - penalty);
    criteria.layoutOverflow.status = criteria.layoutOverflow.score >= 50 ? 'warn' : 'fail';
    criteria.layoutOverflow.details = `Horizontal overflow phát hiện ở ${overflowTotal}/${viewportData.length} viewports`;
    
    const overflowElements = viewportData.flatMap(d => d.overflowElements || []);
    if (overflowElements.length > 0) {
      criteria.layoutOverflow.issues.push(
        `Các element gây overflow: ${overflowElements.map(e => `<${e.tag}> (${e.width}px)`).join(', ')}`
      );
    }
    criteria.layoutOverflow.issues.push('Thêm overflow-x: hidden hoặc sửa layout để không vượt quá viewport width');
  }

  // 4. Font Responsiveness
  const mobileFonts = mobileViewports.flatMap(d => d.fontSizes || []);
  const desktopFonts = viewportData.filter(d => d.viewport?.category?.startsWith('Desktop')).flatMap(d => d.fontSizes || []);
  
  criteria.fontResponsiveness = {
    name: 'Font Responsiveness',
    icon: '🔤',
    score: 0,
    status: 'fail',
    details: '',
    issues: [],
  };
  
  if (mobileFonts.length > 0 && desktopFonts.length > 0) {
    const avgMobile = mobileFonts.reduce((a, b) => a + b, 0) / mobileFonts.length;
    const avgDesktop = desktopFonts.reduce((a, b) => a + b, 0) / desktopFonts.length;
    const ratio = avgMobile / avgDesktop;
    
    // Good if fonts scale down on mobile (ratio between 0.75 and 1.0)
    if (ratio >= 0.8 && ratio <= 1.05) {
      criteria.fontResponsiveness.score = 90;
      criteria.fontResponsiveness.status = 'pass';
      criteria.fontResponsiveness.details = `Font scaling tốt. Mobile avg: ${avgMobile.toFixed(1)}px, Desktop avg: ${avgDesktop.toFixed(1)}px`;
    } else if (ratio >= 0.6 && ratio < 0.8) {
      criteria.fontResponsiveness.score = 70;
      criteria.fontResponsiveness.status = 'warn';
      criteria.fontResponsiveness.details = `Font trên mobile nhỏ hơn nhiều so với desktop (ratio: ${ratio.toFixed(2)})`;
      criteria.fontResponsiveness.issues.push('Sử dụng clamp() hoặc calc() để font scale mượt hơn');
    } else {
      criteria.fontResponsiveness.score = 50;
      criteria.fontResponsiveness.status = 'warn';
      criteria.fontResponsiveness.details = `Font size không thay đổi phù hợp giữa các viewport (ratio: ${ratio.toFixed(2)})`;
      criteria.fontResponsiveness.issues.push('Sử dụng responsive typography: font-size: clamp(1rem, 2.5vw, 2rem)');
    }
  } else {
    criteria.fontResponsiveness.score = 50;
    criteria.fontResponsiveness.status = 'warn';
    criteria.fontResponsiveness.details = 'Không đủ dữ liệu font size để đánh giá';
  }

  // 5. Image Responsiveness
  const imgData = viewportData[0]?.images || { total: 0, responsive: 0, withSrcset: 0, withPicture: 0 };
  criteria.imageResponsiveness = {
    name: 'Image Responsiveness',
    icon: '🖼️',
    score: 0,
    status: 'fail',
    details: '',
    issues: [],
  };
  
  if (imgData.total === 0) {
    criteria.imageResponsiveness.score = 100;
    criteria.imageResponsiveness.status = 'pass';
    criteria.imageResponsiveness.details = 'Không có ảnh trên trang (N/A)';
  } else {
    let imgScore = 0;
    const responsiveRatio = imgData.responsive / imgData.total;
    imgScore += responsiveRatio * 50; // 50% weight for basic responsive
    
    const srcsetRatio = imgData.withSrcset / imgData.total;
    imgScore += srcsetRatio * 30; // 30% weight for srcset
    
    const pictureRatio = imgData.withPicture / imgData.total;
    imgScore += pictureRatio * 20; // 20% weight for picture element

    criteria.imageResponsiveness.score = Math.round(imgScore);
    criteria.imageResponsiveness.status = imgScore >= 70 ? 'pass' : imgScore >= 40 ? 'warn' : 'fail';
    criteria.imageResponsiveness.details = `${imgData.total} ảnh: ${imgData.responsive} responsive, ${imgData.withSrcset} có srcset, ${imgData.withPicture} dùng <picture>`;
    
    if (imgData.responsive < imgData.total) {
      criteria.imageResponsiveness.issues.push(`${imgData.total - imgData.responsive} ảnh chưa responsive. Thêm max-width: 100% và height: auto`);
    }
    if (imgData.withSrcset === 0) {
      criteria.imageResponsiveness.issues.push('Sử dụng srcset attribute để serve ảnh phù hợp kích thước thiết bị');
    }
    if (imgData.oversized > 0) {
      criteria.imageResponsiveness.issues.push(`${imgData.oversized} ảnh quá lớn so với kích thước hiển thị. Tối ưu kích thước ảnh`);
    }
  }

  // 6. Touch Targets
  const mobileTouchData = mobileViewports[0]?.touchTargets || { total: 0, tooSmall: 0 };
  criteria.touchTargets = {
    name: 'Touch Targets',
    icon: '👆',
    score: 0,
    status: 'fail',
    details: '',
    issues: [],
  };
  
  if (mobileTouchData.total === 0) {
    criteria.touchTargets.score = 100;
    criteria.touchTargets.status = 'pass';
    criteria.touchTargets.details = 'Không có interactive elements (N/A)';
  } else {
    const goodRatio = 1 - (mobileTouchData.tooSmall / mobileTouchData.total);
    criteria.touchTargets.score = Math.round(goodRatio * 100);
    criteria.touchTargets.status = goodRatio >= 0.9 ? 'pass' : goodRatio >= 0.7 ? 'warn' : 'fail';
    criteria.touchTargets.details = `${mobileTouchData.total} interactive elements, ${mobileTouchData.tooSmall} quá nhỏ (<44px)`;
    
    if (mobileTouchData.tooSmall > 0) {
      criteria.touchTargets.issues.push(`${mobileTouchData.tooSmall} elements cần min-width/min-height: 44px (WCAG 2.5.8)`);
      const examples = mobileTouchData.elements?.slice(0, 3) || [];
      examples.forEach(el => {
        criteria.touchTargets.issues.push(`  - <${el.tag}> "${el.text}" (${el.width}x${el.height}px)`);
      });
    }
  }

  // 7. Content Reflow
  criteria.contentReflow = {
    name: 'Content Reflow',
    icon: '🔄',
    score: 0,
    status: 'fail',
    details: '',
    issues: [],
  };
  
  // Score based on overflow + layout usage combination
  const hasGoodLayout = viewportData.some(d => d.layout?.usesFlexbox || d.layout?.usesGrid);
  const noMobileOverflow = overflowMobile === 0;
  
  let reflowScore = 0;
  if (noMobileOverflow) reflowScore += 50;
  if (hasGoodLayout) reflowScore += 30;
  if (responsiveQueries.length >= 2) reflowScore += 20;
  
  criteria.contentReflow.score = reflowScore;
  criteria.contentReflow.status = reflowScore >= 70 ? 'pass' : reflowScore >= 40 ? 'warn' : 'fail';
  criteria.contentReflow.details = `Layout reflow: ${noMobileOverflow ? 'không overflow' : 'có overflow'} trên mobile, ${hasGoodLayout ? 'có' : 'không'} modern layout`;
  
  if (!noMobileOverflow) criteria.contentReflow.issues.push('Nội dung bị overflow trên mobile, cần điều chỉnh layout');
  if (!hasGoodLayout) criteria.contentReflow.issues.push('Sử dụng CSS Flexbox/Grid để nội dung tự động reflow theo kích thước màn hình');

  // 8. Navigation Responsive
  const mobileNavData = mobileViewports[0]?.navigation || {};
  const desktopNavData = viewportData.find(d => d.viewport?.category === 'Desktop L')?.navigation || {};

  criteria.navigationResponsive = {
    name: 'Navigation Responsive',
    icon: '🧭',
    score: 0,
    status: 'fail',
    details: '',
    issues: [],
  };
  
  if (!mobileNavData.hasNav && !desktopNavData.hasNav) {
    criteria.navigationResponsive.score = 50;
    criteria.navigationResponsive.status = 'warn';
    criteria.navigationResponsive.details = 'Không phát hiện navigation element';
  } else {
    let navScore = 50; // Base score for having nav
    if (mobileNavData.hasHamburger) navScore += 30;
    if (mobileNavData.hasNav) navScore += 20;
    
    criteria.navigationResponsive.score = Math.min(100, navScore);
    criteria.navigationResponsive.status = navScore >= 70 ? 'pass' : navScore >= 40 ? 'warn' : 'fail';
    criteria.navigationResponsive.details = `Navigation: ${mobileNavData.hasHamburger ? 'có' : 'không có'} mobile menu, ${mobileNavData.hasNav ? 'visible' : 'hidden'} trên mobile`;
    
    if (!mobileNavData.hasHamburger) {
      criteria.navigationResponsive.issues.push('Thêm hamburger menu hoặc bottom navigation cho mobile');
    }
  }

  // 9. Viewport Units
  const unitData = viewportData[0]?.viewportUnits || {};
  criteria.viewportUnits = {
    name: 'Viewport Units Usage',
    icon: '📏',
    score: 0,
    status: 'fail',
    details: '',
    issues: [],
  };
  
  let unitScore = 0;
  if (unitData.usesRem) unitScore += 30;
  if (unitData.usesPercent) unitScore += 25;
  if (unitData.usesVw) unitScore += 20;
  if (unitData.usesVh) unitScore += 15;
  if (unitData.hardcodedPx < 20) unitScore += 10;
  
  criteria.viewportUnits.score = Math.min(100, unitScore);
  criteria.viewportUnits.status = unitScore >= 70 ? 'pass' : unitScore >= 40 ? 'warn' : 'fail';
  
  const usedUnits = [];
  if (unitData.usesRem) usedUnits.push('rem');
  if (unitData.usesPercent) usedUnits.push('%');
  if (unitData.usesVw) usedUnits.push('vw');
  if (unitData.usesVh) usedUnits.push('vh');
  
  criteria.viewportUnits.details = `Sử dụng: ${usedUnits.join(', ') || 'không phát hiện'}, ${unitData.hardcodedPx} hardcoded px values`;
  
  if (!unitData.usesRem) criteria.viewportUnits.issues.push('Sử dụng rem thay vì px cho font-size và spacing');
  if (!unitData.usesPercent && !unitData.usesVw) criteria.viewportUnits.issues.push('Sử dụng % hoặc vw cho width thay vì px cố định');

  // 10. Flexbox/Grid Usage
  const layoutData = viewportData[0]?.layout || {};
  criteria.flexboxGridUsage = {
    name: 'Flexbox/Grid Usage',
    icon: '🧱',
    score: 0,
    status: 'fail',
    details: '',
    issues: [],
  };
  
  let layoutScore = 0;
  if (layoutData.usesFlexbox) layoutScore += 50;
  if (layoutData.usesGrid) layoutScore += 50;
  if (layoutData.flexCount > 5) layoutScore += 10;
  if (layoutData.gridCount > 2) layoutScore += 10;
  
  criteria.flexboxGridUsage.score = Math.min(100, layoutScore);
  criteria.flexboxGridUsage.status = layoutScore >= 50 ? 'pass' : layoutScore >= 25 ? 'warn' : 'fail';
  criteria.flexboxGridUsage.details = `Flexbox: ${layoutData.flexCount || 0} elements, Grid: ${layoutData.gridCount || 0} elements`;
  
  if (!layoutData.usesFlexbox) criteria.flexboxGridUsage.issues.push('Sử dụng CSS Flexbox cho component layouts (nav, cards, etc.)');
  if (!layoutData.usesGrid) criteria.flexboxGridUsage.issues.push('Sử dụng CSS Grid cho page-level layouts');

  // 11. Performance Mobile
  const mobileLoadTimes = mobileViewports.map(d => d.loadTime).filter(t => t != null);
  criteria.performanceMobile = {
    name: 'Mobile Performance',
    icon: '⚡',
    score: 0,
    status: 'fail',
    details: '',
    issues: [],
  };
  
  if (mobileLoadTimes.length > 0) {
    const avgLoadTime = mobileLoadTimes.reduce((a, b) => a + b, 0) / mobileLoadTimes.length;
    
    if (avgLoadTime < 2000) {
      criteria.performanceMobile.score = 100;
      criteria.performanceMobile.status = 'pass';
    } else if (avgLoadTime < 4000) {
      criteria.performanceMobile.score = 75;
      criteria.performanceMobile.status = 'pass';
    } else if (avgLoadTime < 6000) {
      criteria.performanceMobile.score = 50;
      criteria.performanceMobile.status = 'warn';
      criteria.performanceMobile.issues.push('Tối ưu tốc độ load: lazy loading images, minify CSS/JS, sử dụng CDN');
    } else {
      criteria.performanceMobile.score = 25;
      criteria.performanceMobile.status = 'fail';
      criteria.performanceMobile.issues.push('Trang load quá chậm trên mobile. Cần tối ưu nghiêm túc: giảm kích thước assets, sử dụng code splitting');
    }
    criteria.performanceMobile.details = `Thời gian load trung bình trên mobile: ${(avgLoadTime / 1000).toFixed(2)}s`;
  } else {
    criteria.performanceMobile.score = 50;
    criteria.performanceMobile.status = 'warn';
    criteria.performanceMobile.details = 'Không đủ dữ liệu load time';
  }

  // 12. Text Readability
  const mobileTextData = mobileViewports[0]?.textReadability || { totalElements: 0, readableElements: 0 };
  criteria.textReadability = {
    name: 'Text Readability',
    icon: '👁️',
    score: 0,
    status: 'fail',
    details: '',
    issues: [],
  };
  
  if (mobileTextData.totalElements === 0) {
    criteria.textReadability.score = 100;
    criteria.textReadability.status = 'pass';
    criteria.textReadability.details = 'Không có text elements (N/A)';
  } else {
    const readableRatio = mobileTextData.readableElements / mobileTextData.totalElements;
    criteria.textReadability.score = Math.round(readableRatio * 100);
    criteria.textReadability.status = readableRatio >= 0.9 ? 'pass' : readableRatio >= 0.7 ? 'warn' : 'fail';
    criteria.textReadability.details = `${mobileTextData.readableElements}/${mobileTextData.totalElements} text elements đọc được (≥14px) trên mobile`;
    
    if (readableRatio < 0.9) {
      criteria.textReadability.issues.push('Tăng font-size tối thiểu lên 14px trên mobile cho dễ đọc');
      const examples = mobileTextData.smallTextElements?.slice(0, 3) || [];
      examples.forEach(el => {
        criteria.textReadability.issues.push(`  - <${el.tag}> "${el.text}" (${el.fontSize}px)`);
      });
    }
  }

  return criteria;
}

/**
 * Calculate overall weighted score
 */
function calculateOverallScore(criteria) {
  let totalScore = 0;
  
  for (const [key, weight] of Object.entries(CRITERIA_WEIGHTS)) {
    if (criteria[key]) {
      totalScore += criteria[key].score * weight;
    }
  }
  
  return Math.round(totalScore);
}

/**
 * Get grade from score
 */
function getGrade(score) {
  if (score >= 90) return { label: 'Excellent', emoji: '🏆', color: '#00e676' };
  if (score >= 75) return { label: 'Good', emoji: '✅', color: '#76ff03' };
  if (score >= 50) return { label: 'Needs Work', emoji: '⚠️', color: '#ffc107' };
  return { label: 'Poor', emoji: '❌', color: '#ff5252' };
}

/**
 * Generate prioritized recommendations
 */
function generateRecommendations(criteria, viewportData) {
  const recommendations = [];
  
  // Sort criteria by score ascending (worst first)
  const sorted = Object.entries(criteria)
    .sort((a, b) => a[1].score - b[1].score);
  
  for (const [key, data] of sorted) {
    if (data.issues && data.issues.length > 0) {
      recommendations.push({
        criterion: data.name,
        icon: data.icon,
        priority: data.score < 50 ? 'high' : data.score < 75 ? 'medium' : 'low',
        currentScore: data.score,
        actions: data.issues,
        codeExample: getCodeExample(key),
      });
    }
  }
  
  return recommendations;
}

/**
 * Get relevant code example for each criterion
 */
function getCodeExample(criterionKey) {
  const examples = {
    viewportMeta: `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    
    mediaQueries: `/* Breakpoints chuẩn hiện đại */
@media (max-width: 480px)  { /* Mobile S */ }
@media (max-width: 768px)  { /* Mobile L / Tablet */ }
@media (max-width: 1024px) { /* Tablet L */ }
@media (max-width: 1440px) { /* Desktop */ }`,
    
    layoutOverflow: `/* Prevent overflow */
* { box-sizing: border-box; }
img, video { max-width: 100%; height: auto; }
body { overflow-x: hidden; }
.container { width: 100%; max-width: 1200px; margin: 0 auto; padding: 0 1rem; }`,
    
    fontResponsiveness: `/* Responsive typography with clamp() */
h1 { font-size: clamp(1.5rem, 4vw, 3rem); }
h2 { font-size: clamp(1.25rem, 3vw, 2rem); }
p  { font-size: clamp(0.875rem, 1.5vw, 1.125rem); }`,
    
    imageResponsiveness: `<!-- Responsive images -->
<picture>
  <source media="(max-width: 768px)" srcset="img-small.webp">
  <source media="(max-width: 1200px)" srcset="img-medium.webp">
  <img src="img-large.webp" alt="..." loading="lazy" style="max-width:100%;height:auto;">
</picture>`,
    
    touchTargets: `/* Touch targets theo WCAG */
a, button, input, select {
  min-width: 44px;
  min-height: 44px;
  padding: 12px 16px;
}`,
    
    contentReflow: `/* Auto-reflow layout */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
}`,
    
    navigationResponsive: `/* Mobile navigation */
@media (max-width: 768px) {
  .nav-links { display: none; }
  .hamburger { display: flex; }
  .nav-links.active { display: flex; flex-direction: column; }
}`,
    
    viewportUnits: `/* Sử dụng relative units */
:root { font-size: 16px; }
.container { width: 90%; max-width: 75rem; }
.spacing { padding: 2rem; margin-bottom: 1.5rem; }`,
    
    flexboxGridUsage: `/* Modern CSS Layout */
.header { display: flex; justify-content: space-between; align-items: center; }
.main { display: grid; grid-template-columns: 1fr 3fr; gap: 2rem; }
@media (max-width: 768px) {
  .main { grid-template-columns: 1fr; }
}`,
    
    performanceMobile: `<!-- Performance optimization -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<img loading="lazy" decoding="async" src="..." alt="...">
<script defer src="app.js"></script>`,
    
    textReadability: `/* Mobile-friendly text */
body { font-size: 1rem; line-height: 1.6; }
@media (max-width: 768px) {
  body { font-size: 0.9375rem; } /* 15px minimum */
  small { font-size: 0.875rem; }  /* 14px minimum */
}`,
  };
  
  return examples[criterionKey] || '';
}

module.exports = { runAudit, VIEWPORTS };
