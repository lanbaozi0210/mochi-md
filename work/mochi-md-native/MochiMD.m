#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

#ifndef MOCHI_INITIAL_HEIGHT
#define MOCHI_INITIAL_HEIGHT 780
#endif

static BOOL MochiSupportsDocumentURL(NSURL *url) {
    if (!url.isFileURL) return NO;
    NSString *extension = url.pathExtension.lowercaseString;
    return [@[@"md", @"markdown", @"txt"] containsObject:extension];
}

@interface MochiAppDelegate : NSObject <NSApplicationDelegate, NSWindowDelegate, WKScriptMessageHandler, WKNavigationDelegate>
@property(strong) NSWindow *window;
@property(strong) WKWebView *webView;
@property(strong) WKWebView *pdfWebView;
@property(copy) NSString *pdfRequestID;
@property(strong) NSURL *pdfDestination;
@property(strong) NSMutableArray<NSData *> *pdfPageData;
@property(assign) NSInteger pdfPageCount;
@property(assign) BOOL documentDirty;
@property(assign) BOOL forceClosing;
@property(assign) BOOL quitRequested;
@property(copy) NSString *documentTitle;
@property(assign) BOOL webReady;
@property(strong) NSMutableArray<NSDictionary *> *pendingOpenDocuments;
@end

@implementation MochiAppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [self configureMenu];

    NSString *bridge = @"window.__MOCHI_NATIVE__=true;"
        "window.mochiNative={pending:{},invoke:function(command,args){var self=this;return new Promise(function(resolve,reject){var id=String(Date.now())+Math.random().toString(16).slice(2);self.pending[id]={resolve:resolve,reject:reject};window.webkit.messageHandlers.mochi.postMessage({id:id,command:command,args:args||{}});});},settle:function(message){var task=this.pending[message.id];if(!task)return;delete this.pending[message.id];if(message.error)task.reject(new Error(message.error));else task.resolve(message.result);}};";

    WKUserContentController *controller = [[WKUserContentController alloc] init];
    [controller addScriptMessageHandler:self name:@"mochi"];
    WKUserScript *script = [[WKUserScript alloc] initWithSource:bridge injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES];
    [controller addUserScript:script];
    WKUserScript *readyScript = [[WKUserScript alloc] initWithSource:@"window.webkit.messageHandlers.mochi.postMessage({command:'web_ready'});" injectionTime:WKUserScriptInjectionTimeAtDocumentEnd forMainFrameOnly:YES];
    [controller addUserScript:readyScript];

    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    configuration.userContentController = controller;
    configuration.websiteDataStore = [WKWebsiteDataStore defaultDataStore];
    self.webView = [[WKWebView alloc] initWithFrame:NSZeroRect configuration:configuration];
    [self.webView setValue:@NO forKey:@"drawsBackground"];

    NSWindowStyleMask style = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable;
    self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 1280, MOCHI_INITIAL_HEIGHT) styleMask:style backing:NSBackingStoreBuffered defer:NO];
    self.window.title = @"Mochi MD";
    self.window.titleVisibility = NSWindowTitleVisible;
    self.window.titlebarAppearsTransparent = YES;
    self.window.movableByWindowBackground = NO;
    self.window.minSize = NSMakeSize(860, 480);
    self.window.backgroundColor = [NSColor colorWithRed:.94 green:.93 blue:.97 alpha:1];
    self.window.contentView = self.webView;
    self.window.delegate = self;
    [self.window center];
    [self.window makeKeyAndOrderFront:nil];

    NSURL *iconURL = [[NSBundle mainBundle] URLForResource:@"MochiMD-0.3.5" withExtension:@"icns"];
    if (iconURL) [NSApplication sharedApplication].applicationIconImage = [[NSImage alloc] initWithContentsOfURL:iconURL];

    NSURL *root = [[[NSBundle mainBundle] resourceURL] URLByAppendingPathComponent:@"web" isDirectory:YES];
    NSURL *index = [root URLByAppendingPathComponent:@"index.html"];
    [self.webView loadFileURL:index allowingReadAccessToURL:root];
    [[NSApplication sharedApplication] activateIgnoringOtherApps:YES];
}

- (NSArray<NSDictionary *> *)documentsForURLs:(NSArray<NSURL *> *)urls {
    NSMutableArray<NSDictionary *> *documents = [NSMutableArray array];
    for (NSURL *url in urls) {
        if (!MochiSupportsDocumentURL(url)) continue;
        NSError *error = nil;
        NSStringEncoding encoding = NSUTF8StringEncoding;
        NSString *content = [NSString stringWithContentsOfURL:url usedEncoding:&encoding error:&error];
        if (!content) content = [NSString stringWithContentsOfURL:url encoding:NSUTF8StringEncoding error:&error];
        if (!content) {
            NSAlert *alert = [[NSAlert alloc] init];
            alert.messageText = [NSString stringWithFormat:@"无法打开“%@”", url.lastPathComponent];
            alert.informativeText = error.localizedDescription ?: @"无法读取这个文档。";
            [alert runModal];
            continue;
        }
        [documents addObject:@{ @"path":url.path, @"name":url.lastPathComponent, @"content":content }];
    }
    return documents;
}

- (void)deliverDocumentsToWebView:(NSArray<NSDictionary *> *)documents {
    if (!documents.count) return;
    if (!self.webReady) {
        if (!self.pendingOpenDocuments) self.pendingOpenDocuments = [NSMutableArray array];
        [self.pendingOpenDocuments addObjectsFromArray:documents];
        return;
    }
    NSData *data = [NSJSONSerialization dataWithJSONObject:documents options:0 error:nil];
    NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    NSString *script = [NSString stringWithFormat:@"window.mochiOpenExternalFiles(%@)", json];
    [self.webView evaluateJavaScript:script completionHandler:^(id result, NSError *error) {
        if (error) NSLog(@"Mochi MD failed to open external document: %@", error);
    }];
}

- (void)flushPendingOpenDocuments {
    if (!self.pendingOpenDocuments.count) return;
    NSArray *documents = [self.pendingOpenDocuments copy];
    [self.pendingOpenDocuments removeAllObjects];
    [self deliverDocumentsToWebView:documents];
}

- (void)openDocumentURLs:(NSArray<NSURL *> *)urls {
    [self deliverDocumentsToWebView:[self documentsForURLs:urls]];
    [self.window makeKeyAndOrderFront:nil];
    [[NSApplication sharedApplication] activateIgnoringOtherApps:YES];
}

- (void)application:(NSApplication *)application openURLs:(NSArray<NSURL *> *)urls {
    [self openDocumentURLs:urls];
}

- (BOOL)application:(NSApplication *)application openFile:(NSString *)filename {
    [self openDocumentURLs:@[[NSURL fileURLWithPath:filename]]];
    return YES;
}

- (void)application:(NSApplication *)application openFiles:(NSArray<NSString *> *)filenames {
    NSMutableArray<NSURL *> *urls = [NSMutableArray arrayWithCapacity:filenames.count];
    for (NSString *filename in filenames) [urls addObject:[NSURL fileURLWithPath:filename]];
    [self openDocumentURLs:urls];
    [application replyToOpenOrPrint:NSApplicationDelegateReplySuccess];
}

- (void)windowWillClose:(NSNotification *)notification {
    [[NSApplication sharedApplication] terminate:nil];
}

- (BOOL)windowShouldClose:(NSWindow *)sender {
    if (!self.quitRequested) {
        [sender miniaturize:nil];
        return NO;
    }
    if (self.forceClosing || !self.documentDirty) return YES;
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = [NSString stringWithFormat:@"要保存对“%@”的更改吗？", self.documentTitle.length ? self.documentTitle : @"未命名文档"];
    alert.informativeText = @"如果不保存，你的修改将会丢失。";
    [alert addButtonWithTitle:@"保存"];
    [alert addButtonWithTitle:@"不保存"];
    [alert addButtonWithTitle:@"取消"];
    NSModalResponse response = [alert runModal];
    if (response == NSAlertFirstButtonReturn) {
        [self.webView evaluateJavaScript:@"window.mochiSaveBeforeClose()" completionHandler:nil];
    } else if (response == NSAlertSecondButtonReturn) {
        self.forceClosing = YES;
        return YES;
    } else {
        self.quitRequested = NO;
    }
    return NO;
}

- (BOOL)applicationShouldHandleReopen:(NSApplication *)sender hasVisibleWindows:(BOOL)flag {
    if (self.window.isMiniaturized) [self.window deminiaturize:nil];
    [self.window makeKeyAndOrderFront:nil];
    return YES;
}

- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender {
    if (self.forceClosing || (self.quitRequested && !self.documentDirty)) return NSTerminateNow;
    [self requestQuit:nil];
    return NSTerminateCancel;
}

- (void)userContentController:(WKUserContentController *)userContentController didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![message.body isKindOfClass:[NSDictionary class]]) return;
    NSDictionary *body = (NSDictionary *)message.body;
    NSString *requestID = body[@"id"];
    NSString *command = body[@"command"];
    NSDictionary *args = [body[@"args"] isKindOfClass:[NSDictionary class]] ? body[@"args"] : @{};
    if ([command isEqualToString:@"web_ready"]) {
        self.webReady = YES;
        [self flushPendingOpenDocuments];
        return;
    }
    if (!requestID || !command) return;

    if ([command isEqualToString:@"open_markdown"]) [self openMarkdown:requestID];
    else if ([command isEqualToString:@"save_markdown"]) [self saveMarkdown:requestID args:args];
    else if ([command isEqualToString:@"export_pdf"]) [self exportPDF:requestID args:args];
    else if ([command isEqualToString:@"set_represented_path"]) {
        NSString *path = [args[@"path"] isKindOfClass:[NSString class]] ? args[@"path"] : nil;
        self.window.representedURL = path.length ? [NSURL fileURLWithPath:path] : nil;
        [self settle:requestID result:@YES error:nil];
    }
    else if ([command isEqualToString:@"reveal_in_finder"]) {
        NSString *path = [args[@"path"] isKindOfClass:[NSString class]] ? args[@"path"] : nil;
        if (!path.length) [self settle:requestID result:nil error:@"文件尚未保存到磁盘"];
        else {
            [[NSWorkspace sharedWorkspace] activateFileViewerSelectingURLs:@[[NSURL fileURLWithPath:path]]];
            [self settle:requestID result:@YES error:nil];
        }
    }
    else if ([command isEqualToString:@"copy_path"]) {
        NSString *path = [args[@"path"] isKindOfClass:[NSString class]] ? args[@"path"] : nil;
        if (!path.length) [self settle:requestID result:nil error:@"文件尚未保存到磁盘"];
        else {
            NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
            [pasteboard clearContents];
            [pasteboard setString:path forType:NSPasteboardTypeString];
            [self settle:requestID result:@YES error:nil];
        }
    }
    else if ([command isEqualToString:@"existing_paths"]) {
        NSArray *paths = [args[@"paths"] isKindOfClass:[NSArray class]] ? args[@"paths"] : @[];
        NSMutableArray *existing = [NSMutableArray array];
        for (id value in paths) {
            if ([value isKindOfClass:[NSString class]] && [[NSFileManager defaultManager] fileExistsAtPath:value]) [existing addObject:value];
        }
        [self settle:requestID result:existing error:nil];
    }
    else if ([command isEqualToString:@"set_dirty"]) {
        self.documentDirty = [args[@"dirty"] boolValue];
        self.documentTitle = [args[@"title"] isKindOfClass:[NSString class]] ? args[@"title"] : @"未命名文档";
        self.window.documentEdited = self.documentDirty;
        [self settle:requestID result:@YES error:nil];
    }
    else if ([command isEqualToString:@"confirm_unsaved"]) [self confirmUnsaved:requestID title:args[@"title"]];
    else if ([command isEqualToString:@"confirm_action"]) [self confirmAction:requestID args:args];
    else if ([command isEqualToString:@"choose_avatar"]) [self chooseAvatar:requestID];
    else if ([command isEqualToString:@"force_close"]) {
        self.quitRequested = YES;
        self.forceClosing = YES;
        [self settle:requestID result:@YES error:nil];
        [self.window performClose:nil];
    }
    else if ([command isEqualToString:@"cancel_quit"]) {
        self.quitRequested = NO;
        self.forceClosing = NO;
        [self settle:requestID result:@YES error:nil];
    }
    else [self settle:requestID result:nil error:@"Unknown native command"];
}

- (void)confirmAction:(NSString *)requestID args:(NSDictionary *)args {
    NSString *title = [args[@"title"] isKindOfClass:[NSString class]] ? args[@"title"] : @"确认操作";
    NSString *message = [args[@"message"] isKindOfClass:[NSString class]] ? args[@"message"] : @"";
    NSString *confirmLabel = [args[@"confirmLabel"] isKindOfClass:[NSString class]] ? args[@"confirmLabel"] : @"继续";
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = title;
    alert.informativeText = message;
    [alert addButtonWithTitle:confirmLabel];
    [alert addButtonWithTitle:@"取消"];
    NSModalResponse response = [alert runModal];
    [self settle:requestID result:@(response == NSAlertFirstButtonReturn) error:nil];
}

- (void)chooseAvatar:(NSString *)requestID {
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.allowedFileTypes = @[@"png", @"jpg", @"jpeg", @"webp", @"gif", @"heic"];
    panel.allowsMultipleSelection = NO;
    panel.canChooseDirectories = NO;
    panel.title = @"选择自定义头像";
    panel.message = @"图片会自动居中裁切为方形";
    if ([panel runModal] != NSModalResponseOK || !panel.URL) {
        [self settle:requestID result:nil error:nil];
        return;
    }

    NSImage *source = [[NSImage alloc] initWithContentsOfURL:panel.URL];
    if (!source || source.size.width <= 0 || source.size.height <= 0) {
        [self settle:requestID result:nil error:@"无法读取这张图片"];
        return;
    }

    NSInteger pixels = 256;
    NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc]
        initWithBitmapDataPlanes:NULL pixelsWide:pixels pixelsHigh:pixels
        bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES isPlanar:NO
        colorSpaceName:NSCalibratedRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
    bitmap.size = NSMakeSize(pixels, pixels);
    NSGraphicsContext *context = [NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap];
    [NSGraphicsContext saveGraphicsState];
    [NSGraphicsContext setCurrentContext:context];
    [[NSColor clearColor] setFill];
    NSRectFill(NSMakeRect(0, 0, pixels, pixels));
    CGFloat side = MIN(source.size.width, source.size.height);
    NSRect crop = NSMakeRect((source.size.width - side) / 2.0, (source.size.height - side) / 2.0, side, side);
    [source drawInRect:NSMakeRect(0, 0, pixels, pixels) fromRect:crop operation:NSCompositingOperationSourceOver fraction:1.0 respectFlipped:YES hints:@{NSImageHintInterpolation:@(NSImageInterpolationHigh)}];
    [NSGraphicsContext restoreGraphicsState];
    NSData *png = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
    NSString *dataURL = [NSString stringWithFormat:@"data:image/png;base64,%@", [png base64EncodedStringWithOptions:0]];
    [self settle:requestID result:dataURL error:nil];
}

- (void)confirmUnsaved:(NSString *)requestID title:(NSString *)title {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = [NSString stringWithFormat:@"要保存对“%@”的更改吗？", title.length ? title : @"未命名文档"];
    alert.informativeText = @"在继续之前，可以保存这次修改。";
    [alert addButtonWithTitle:@"保存"];
    [alert addButtonWithTitle:@"不保存"];
    [alert addButtonWithTitle:@"取消"];
    NSModalResponse response = [alert runModal];
    NSString *choice = response == NSAlertFirstButtonReturn ? @"save" : (response == NSAlertSecondButtonReturn ? @"discard" : @"cancel");
    [self settle:requestID result:choice error:nil];
}

- (void)openMarkdown:(NSString *)requestID {
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.allowedFileTypes = @[@"md", @"markdown", @"txt"];
    panel.allowsMultipleSelection = NO;
    panel.canChooseDirectories = NO;
    panel.title = @"打开 Markdown 文档";
    if ([panel runModal] != NSModalResponseOK || !panel.URL) {
        [self settle:requestID result:nil error:nil];
        return;
    }
    NSError *error = nil;
    NSString *content = [NSString stringWithContentsOfURL:panel.URL encoding:NSUTF8StringEncoding error:&error];
    if (error) [self settle:requestID result:nil error:error.localizedDescription];
    else [self settle:requestID result:@{@"path":panel.URL.path, @"name":panel.URL.lastPathComponent, @"content":content ?: @""} error:nil];
}

- (void)saveMarkdown:(NSString *)requestID args:(NSDictionary *)args {
    NSString *content = [args[@"content"] isKindOfClass:[NSString class]] ? args[@"content"] : @"";
    NSString *path = [args[@"path"] isKindOfClass:[NSString class]] ? args[@"path"] : nil;
    NSURL *destination = path.length ? [NSURL fileURLWithPath:path] : nil;
    if (!destination) {
        NSSavePanel *panel = [NSSavePanel savePanel];
        panel.allowedFileTypes = nil;
        panel.allowsOtherFileTypes = YES;
        panel.extensionHidden = NO;
        panel.canCreateDirectories = YES;
        panel.nameFieldStringValue = [args[@"defaultName"] isKindOfClass:[NSString class]] ? args[@"defaultName"] : @"未命名文档.md";
        panel.title = @"保存 Markdown 文档";
        if ([panel runModal] != NSModalResponseOK || !panel.URL) {
            [self settle:requestID result:nil error:nil];
            return;
        }
        destination = panel.URL;
    }
    NSError *error = nil;
    [content writeToURL:destination atomically:YES encoding:NSUTF8StringEncoding error:&error];
    if (error) [self settle:requestID result:nil error:error.localizedDescription];
    else [self settle:requestID result:destination.path error:nil];
}

- (void)exportPDF:(NSString *)requestID args:(NSDictionary *)args {
    NSString *html = [args[@"html"] isKindOfClass:[NSString class]] ? args[@"html"] : @"";
    if (!html.length) {
        [self settle:requestID result:nil error:@"没有可导出的预览内容"];
        return;
    }
    if (self.pdfWebView) {
        [self settle:requestID result:nil error:@"已有 PDF 正在导出"];
        return;
    }

    NSSavePanel *panel = [NSSavePanel savePanel];
    panel.allowedFileTypes = @[@"pdf"];
    panel.allowsOtherFileTypes = NO;
    panel.extensionHidden = NO;
    panel.canCreateDirectories = YES;
    panel.nameFieldStringValue = [args[@"defaultName"] isKindOfClass:[NSString class]] ? args[@"defaultName"] : @"未命名文档.pdf";
    panel.title = @"按当前预览样式导出 PDF";
    if ([panel runModal] != NSModalResponseOK || !panel.URL) {
        [self settle:requestID result:nil error:nil];
        return;
    }

    self.pdfRequestID = requestID;
    self.pdfDestination = panel.URL;
    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    configuration.websiteDataStore = [WKWebsiteDataStore nonPersistentDataStore];
    self.pdfWebView = [[WKWebView alloc] initWithFrame:NSMakeRect(0, 0, 794, 1123) configuration:configuration];
    self.pdfWebView.navigationDelegate = self;
    [self.pdfWebView setValue:@NO forKey:@"drawsBackground"];
    NSURL *baseURL = [[[NSBundle mainBundle] resourceURL] URLByAppendingPathComponent:@"web" isDirectory:YES];
    [self.pdfWebView loadHTMLString:html baseURL:baseURL];
}

- (void)resetPDFExport {
    self.pdfWebView.navigationDelegate = nil;
    self.pdfWebView = nil;
    self.pdfRequestID = nil;
    self.pdfDestination = nil;
    self.pdfPageData = nil;
    self.pdfPageCount = 0;
}

- (void)finishPDFExportWithError:(NSString *)error {
    NSString *requestID = self.pdfRequestID;
    NSURL *destination = self.pdfDestination;
    if (!requestID || !destination) return;
    if (error.length) {
        [self settle:requestID result:nil error:error];
        [self resetPDFExport];
        return;
    }

    NSMutableData *combinedData = [NSMutableData data];
    CGDataConsumerRef consumer = CGDataConsumerCreateWithCFData((__bridge CFMutableDataRef)combinedData);
    CGRect mediaBox = CGRectMake(0, 0, 595.28, 841.89);
    CGContextRef context = consumer ? CGPDFContextCreate(consumer, &mediaBox, NULL) : NULL;
    BOOL rendered = context != NULL;
    for (NSData *data in self.pdfPageData) {
        CGDataProviderRef provider = CGDataProviderCreateWithCFData((__bridge CFDataRef)data);
        CGPDFDocumentRef document = provider ? CGPDFDocumentCreateWithProvider(provider) : NULL;
        CGPDFPageRef page = document ? CGPDFDocumentGetPage(document, 1) : NULL;
        if (!page) rendered = NO;
        if (page && rendered) {
            CGPDFContextBeginPage(context, NULL);
            CGContextSaveGState(context);
            CGAffineTransform transform = CGPDFPageGetDrawingTransform(page, kCGPDFMediaBox, mediaBox, 0, true);
            CGContextConcatCTM(context, transform);
            CGContextDrawPDFPage(context, page);
            CGContextRestoreGState(context);
            CGPDFContextEndPage(context);
        }
        if (document) CGPDFDocumentRelease(document);
        if (provider) CGDataProviderRelease(provider);
        if (!rendered) break;
    }
    if (context) { CGPDFContextClose(context); CGContextRelease(context); }
    if (consumer) CGDataConsumerRelease(consumer);
    BOOL succeeded = rendered && combinedData.length > 0 && [combinedData writeToURL:destination atomically:YES];
    [self settle:requestID result:succeeded ? destination.path : nil error:succeeded ? nil : @"无法生成 PDF 文件"];
    [self resetPDFExport];
}

- (void)renderPDFPageAtIndex:(NSInteger)index {
    if (!self.pdfWebView) return;
    if (index >= self.pdfPageCount) {
        [self finishPDFExportWithError:nil];
        return;
    }
    WKPDFConfiguration *configuration = [[WKPDFConfiguration alloc] init];
    configuration.rect = NSMakeRect(0, index * 1123.0, 794.0, 1123.0);
    [self.pdfWebView createPDFWithConfiguration:configuration completionHandler:^(NSData *data, NSError *error) {
        if (error || !data.length) {
            [self finishPDFExportWithError:error.localizedDescription ?: @"无法渲染 PDF 页面"];
            return;
        }
        [self.pdfPageData addObject:data];
        [self renderPDFPageAtIndex:index + 1];
    }];
}

- (void)beginPDFExportWithContentHeight:(CGFloat)contentHeight {
    self.pdfPageCount = MAX(1, (NSInteger)ceil(contentHeight / 1123.0));
    self.pdfPageData = [NSMutableArray arrayWithCapacity:self.pdfPageCount];
    [self renderPDFPageAtIndex:0];
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    if (webView != self.pdfWebView) return;
    NSString *waitForAssets = @"Promise.race([Promise.all(Array.from(document.images).map(function(image){return image.complete?Promise.resolve():new Promise(function(resolve){image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});})})),new Promise(function(resolve){setTimeout(resolve,1800)})]).then(function(){return true})";
    [webView evaluateJavaScript:waitForAssets completionHandler:^(id result, NSError *error) {
        [webView evaluateJavaScript:@"window.mochiPaginateForPDF?window.mochiPaginateForPDF():1" completionHandler:^(NSNumber *pageCount, NSError *paginationError) {
            if (paginationError) [self finishPDFExportWithError:paginationError.localizedDescription];
            else [self beginPDFExportWithContentHeight:MAX(1123.0, pageCount.doubleValue * 1123.0)];
        }];
    }];
}

- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    if (webView != self.pdfWebView) return;
    [self finishPDFExportWithError:error.localizedDescription ?: @"无法载入 PDF 预览"];
}

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    [self webView:webView didFailNavigation:navigation withError:error];
}

- (void)settle:(NSString *)requestID result:(id)result error:(NSString *)error {
    NSDictionary *payload = @{@"id":requestID, @"result":result ?: [NSNull null], @"error":error ?: [NSNull null]};
    NSData *data = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
    NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    [self.webView evaluateJavaScript:[NSString stringWithFormat:@"window.mochiNative.settle(%@)", json] completionHandler:nil];
}

- (void)configureMenu {
    NSMenu *menu = [[NSMenu alloc] init];
    NSMenuItem *appItem = [[NSMenuItem alloc] init];
    [menu addItem:appItem];
    NSMenu *appMenu = [[NSMenu alloc] init];
    [appMenu addItemWithTitle:@"关于 Mochi MD" action:@selector(orderFrontStandardAboutPanel:) keyEquivalent:@""];
    [appMenu addItem:[NSMenuItem separatorItem]];
    [appMenu addItemWithTitle:@"隐藏 Mochi MD" action:@selector(hide:) keyEquivalent:@"h"];
    [appMenu addItem:[NSMenuItem separatorItem]];
    NSMenuItem *quitItem = [appMenu addItemWithTitle:@"退出 Mochi MD" action:@selector(requestQuit:) keyEquivalent:@"q"];
    quitItem.target = self;
    appItem.submenu = appMenu;

    NSMenuItem *editItem = [[NSMenuItem alloc] init];
    [menu addItem:editItem];
    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"编辑"];
    [editMenu addItemWithTitle:@"撤销" action:@selector(undo:) keyEquivalent:@"z"];
    NSMenuItem *redoItem = [editMenu addItemWithTitle:@"重做" action:@selector(redo:) keyEquivalent:@"z"];
    redoItem.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagShift;
    [editMenu addItem:[NSMenuItem separatorItem]];
    [editMenu addItemWithTitle:@"剪切" action:@selector(cut:) keyEquivalent:@"x"];
    [editMenu addItemWithTitle:@"复制" action:@selector(copy:) keyEquivalent:@"c"];
    [editMenu addItemWithTitle:@"粘贴" action:@selector(paste:) keyEquivalent:@"v"];
    [editMenu addItemWithTitle:@"全选" action:@selector(selectAll:) keyEquivalent:@"a"];
    editItem.submenu = editMenu;
    [NSApplication sharedApplication].mainMenu = menu;
}

- (void)requestQuit:(id)sender {
    self.quitRequested = YES;
    if (self.window.isMiniaturized) [self.window deminiaturize:nil];
    [self.window makeKeyAndOrderFront:nil];
    [self.window performClose:nil];
}
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *app = [NSApplication sharedApplication];
        MochiAppDelegate *delegate = [[MochiAppDelegate alloc] init];
        app.delegate = delegate;
        [app setActivationPolicy:NSApplicationActivationPolicyRegular];
        [app run];
    }
    return 0;
}
