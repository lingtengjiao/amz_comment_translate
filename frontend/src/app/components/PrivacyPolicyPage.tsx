import React from 'react';

export default function PrivacyPolicyPage() {
  return (
    <div style={{
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', 'Helvetica Neue', Arial, sans-serif",
      lineHeight: 1.8,
      color: '#333',
      background: '#f5f5f5',
      padding: '20px',
      minHeight: '100vh'
    }}>
      <div style={{
        maxWidth: '900px',
        margin: '0 auto',
        background: 'white',
        padding: '40px',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{
          color: '#2c3e50',
          fontSize: '32px',
          marginBottom: '10px',
          borderBottom: '3px solid #3498db',
          paddingBottom: '15px'
        }}>
          洞察大王 隐私政策
        </h1>
        <h1 style={{
          fontSize: '24px',
          marginTop: '10px',
          border: 'none',
          padding: 0,
          color: '#2c3e50'
        }}>
          Privacy Policy
        </h1>
        
        <p style={{
          color: '#7f8c8d',
          fontSize: '14px',
          marginBottom: '30px',
          fontStyle: 'italic'
        }}>
          最后更新日期 / Last Updated: 2026年1月19日
        </p>
        
        <div style={{
          background: '#fff3cd',
          padding: '15px',
          borderLeft: '4px solid #ffc107',
          margin: '20px 0'
        }}>
          <strong>重要提示：</strong>本隐私政策说明了洞察大王 Chrome 扩展（以下简称"本扩展"或"我们"）如何收集、使用、存储和保护您的个人信息。使用本扩展即表示您同意本隐私政策的条款。
        </div>
        
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{
            color: '#34495e',
            fontSize: '24px',
            marginTop: '40px',
            marginBottom: '15px',
            paddingLeft: '10px',
            borderLeft: '4px solid #3498db'
          }}>
            一、信息收集 / Information Collection
          </h2>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            为了向您提供产品洞察服务，我们会在您使用本扩展时收集以下信息：
          </p>
          
          <h3 style={{
            color: '#555',
            fontSize: '20px',
            marginTop: '30px',
            marginBottom: '10px'
          }}>
            1.1 账户信息
          </h3>
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            当您注册或登录账户时，我们会收集您的邮箱地址等必要的账户信息，用于身份验证和账户管理。
          </p>
          
          <h3 style={{
            color: '#555',
            fontSize: '20px',
            marginTop: '30px',
            marginBottom: '10px'
          }}>
            1.2 产品与评论数据
          </h3>
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            当您使用本扩展采集 Amazon 产品评论时，我们会收集相关的产品信息和评论数据。这些数据均为 Amazon 网站上的公开信息，我们仅收集您主动选择采集的内容。
          </p>
          
          <h3 style={{
            color: '#555',
            fontSize: '20px',
            marginTop: '30px',
            marginBottom: '10px'
          }}>
            1.3 使用数据
          </h3>
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            我们会收集您使用本扩展的方式和频率等使用数据，用于改进产品体验和服务质量。
          </p>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            <strong>存储说明：</strong>账户认证信息仅存储在您的浏览器本地，不会上传到服务器。产品与评论数据会存储在服务器上，供您后续查看和分析使用。
          </p>
        </div>
        
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{
            color: '#34495e',
            fontSize: '24px',
            marginTop: '40px',
            marginBottom: '15px',
            paddingLeft: '10px',
            borderLeft: '4px solid #3498db'
          }}>
            二、信息使用方式 / How We Use Information
          </h2>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            我们使用收集的信息用于以下目的：
          </p>
          <ul style={{ marginLeft: '30px', marginBottom: '20px' }}>
            <li style={{ marginBottom: '10px' }}>提供核心功能：评论采集、数据存储、翻译服务、智能分析等</li>
            <li style={{ marginBottom: '10px' }}>改进服务质量：优化算法性能、修复问题、开发新功能</li>
            <li style={{ marginBottom: '10px' }}>用户支持：响应您的请求、提供技术支持</li>
          </ul>
        </div>
        
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{
            color: '#34495e',
            fontSize: '24px',
            marginTop: '40px',
            marginBottom: '15px',
            paddingLeft: '10px',
            borderLeft: '4px solid #3498db'
          }}>
            三、纠正、保存与删除您的数据 / Data Correction, Retention and Deletion
          </h2>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            我们会在法律允许或征得您同意的情况下处理您的个人资料，将仅用于履行此隐私声明中提及的目的、行使我们的合法权利，并遵守我们的法律或监管义务之必要期限内保存您的个人资料。
          </p>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            如不再具有使用您个人资料的合法目的时，将从我们的记录中删除您的个人资料或匿名处理，以免您的身份可被识别。
          </p>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            您可以随时通过联系我们 <strong>support@98kamz.com</strong> 来请求纠正或删除您的数据。您应知晓，一旦删除您的账户，您将失去访问或使用洞察大王全部或部分的权利。
          </p>
        </div>
        
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{
            color: '#34495e',
            fontSize: '24px',
            marginTop: '40px',
            marginBottom: '15px',
            paddingLeft: '10px',
            borderLeft: '4px solid #3498db'
          }}>
            四、用户同意与撤回同意 / User Consent and Withdrawal
          </h2>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            当您使用我们的应用时，即表示您同意按照本政策所述的方式收集和使用您的数据。您也可以在任何需要征求您同意的部份，撤回该同意决定。
          </p>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            然而如您撤回该同意决定，我们或无法履行我们已经签订或正尝试与您签订的合约（如履行您的订单）。如欲撤回您的同意决定，请发送邮件至 <strong>support@98kamz.com</strong> 与我们联络。
          </p>
        </div>
        
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{
            color: '#34495e',
            fontSize: '24px',
            marginTop: '40px',
            marginBottom: '15px',
            paddingLeft: '10px',
            borderLeft: '4px solid #3498db'
          }}>
            五、直接营销及自动化决策权利 / Direct Marketing and Automated Decision-Making
          </h2>
          
          <h3 style={{
            color: '#555',
            fontSize: '20px',
            marginTop: '30px',
            marginBottom: '10px'
          }}>
            5.1 自动化决策
          </h3>
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            自动化决策是指无需人工干预，仅通过计算机程序、算法或模型自动分析、评估您的行为习惯、消费偏好、信用状况、健康数据等个人信息，并直接作出决策的活动。
          </p>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            我们暂不使用自动决策技术，故不涉及自动化决策。
          </p>
          
          <h3 style={{
            color: '#555',
            fontSize: '20px',
            marginTop: '30px',
            marginBottom: '10px'
          }}>
            5.2 直接营销
          </h3>
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            您有权随时反对我们向您发送直接营销信息（包括但不限于营销邮件、促销短信、APP 推送广告、电话营销等），且无需支付任何费用。
          </p>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            我们暂未对用户直接发送营销信息，故不适用。
          </p>
        </div>
        
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{
            color: '#34495e',
            fontSize: '24px',
            marginTop: '40px',
            marginBottom: '15px',
            paddingLeft: '10px',
            borderLeft: '4px solid #3498db'
          }}>
            六、修改隐私条款 / Changes to Privacy Policy
          </h2>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            请理解我们或会于我们认为适当的时候修订此隐私声明，我们将记录此隐私声明的最后更新日期，更新发布时将立即生效。未经您的明确同意下，我们不会削减您于此隐私声明下可享的权利。
          </p>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            我们将于显著位置发布重大更改（如针对某些服务的变动，我们将通过弹窗方式告知隐私声明中的具体更改内容）。因此，您应定期查看此隐私声明，以了解我们的最新政策。
          </p>
        </div>
        
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{
            color: '#34495e',
            fontSize: '24px',
            marginTop: '40px',
            marginBottom: '15px',
            paddingLeft: '10px',
            borderLeft: '4px solid #3498db'
          }}>
            七、Cookie 条款 / Cookie Policy
          </h2>
          
          <h3 style={{
            color: '#555',
            fontSize: '20px',
            marginTop: '30px',
            marginBottom: '10px'
          }}>
            7.1 什么是 Cookie？
          </h3>
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            "Cookie"是网站存储在用户计算机上的由 web 服务器生成的一小段数据。
          </p>
          
          <h3 style={{
            color: '#555',
            fontSize: '20px',
            marginTop: '30px',
            marginBottom: '10px'
          }}>
            7.2 我们使用什么 Cookies？
          </h3>
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            我们使用暂时性（session）cookies 及持久性（persistent）cookies。当您关闭浏览器时，暂时性 cookies 将被删除，而持久性 cookies 将保留于您的电脑上，下次前往我们的网站时启动，也可进行删除。一般情况下，持久性 cookie 不会破坏或损害您的计算机、程序或计算机文件。
          </p>
          
          <h3 style={{
            color: '#555',
            fontSize: '20px',
            marginTop: '30px',
            marginBottom: '10px'
          }}>
            7.3 如何管理我的 Cookies？
          </h3>
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            您可通过启动浏览器上的设置，以拒绝设置全部或部分 cookies。有关如何执行此功能的指南，请参阅特定浏览器的说明，了解如何执行此操作。然而，如您使用浏览器设置阻挡所有 cookies（包括绝对必要的 cookies），您或无法访问我们的网站或部分内容。
          </p>
          
          <h3 style={{
            color: '#555',
            fontSize: '20px',
            marginTop: '30px',
            marginBottom: '10px'
          }}>
            7.4 本地存储
          </h3>
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            本扩展使用 Chrome 的本地存储 API 在您的浏览器中存储账户认证信息和配置设置，这些数据仅存储在您的设备上。
          </p>
        </div>
        
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{
            color: '#34495e',
            fontSize: '24px',
            marginTop: '40px',
            marginBottom: '15px',
            paddingLeft: '10px',
            borderLeft: '4px solid #3498db'
          }}>
            八、数据安全 / Data Security
          </h2>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            我们采取以下安全措施保护您的数据：
          </p>
          <ul style={{ marginLeft: '30px', marginBottom: '20px' }}>
            <li style={{ marginBottom: '10px' }}><strong>加密传输</strong>：所有数据传输均使用 HTTPS 加密</li>
            <li style={{ marginBottom: '10px' }}><strong>安全存储</strong>：数据存储在安全的服务器环境中</li>
            <li style={{ marginBottom: '10px' }}><strong>访问控制</strong>：仅授权人员可以访问数据</li>
            <li style={{ marginBottom: '10px' }}><strong>定期备份</strong>：定期备份数据以防止数据丢失</li>
          </ul>
          
          <div style={{
            background: '#fff3cd',
            padding: '15px',
            borderLeft: '4px solid #ffc107',
            margin: '20px 0'
          }}>
            <strong>重要提醒：</strong>虽然我们采取了合理的安全措施，但没有任何系统是 100% 安全的。请妥善保管您的账户信息，不要与他人分享您的登录凭证。
          </div>
        </div>
        
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{
            color: '#34495e',
            fontSize: '24px',
            marginTop: '40px',
            marginBottom: '15px',
            paddingLeft: '10px',
            borderLeft: '4px solid #3498db'
          }}>
            九、数据共享 / Data Sharing
          </h2>
          
          <h3 style={{
            color: '#555',
            fontSize: '20px',
            marginTop: '30px',
            marginBottom: '10px'
          }}>
            9.1 我们不会出售您的数据
          </h3>
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            我们承诺不会向第三方出售、交易或出租您的个人信息或采集的数据。
          </p>
          
          <h3 style={{
            color: '#555',
            fontSize: '20px',
            marginTop: '30px',
            marginBottom: '10px'
          }}>
            9.2 有限的数据共享
          </h3>
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            我们仅在以下情况下可能与第三方共享数据：
          </p>
          <ul style={{ marginLeft: '30px', marginBottom: '20px' }}>
            <li style={{ marginBottom: '10px' }}><strong>服务提供商</strong>：与帮助我们运营服务的第三方服务商（如云存储、翻译 API 提供商）共享必要数据</li>
            <li style={{ marginBottom: '10px' }}><strong>法律要求</strong>：当法律要求或为保护我们的权利时</li>
            <li style={{ marginBottom: '10px' }}><strong>用户同意</strong>：在您明确同意的情况下</li>
          </ul>
        </div>
        
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{
            color: '#34495e',
            fontSize: '24px',
            marginTop: '40px',
            marginBottom: '15px',
            paddingLeft: '10px',
            borderLeft: '4px solid #3498db'
          }}>
            十、数据跨境 / Cross-Border Data Transfers
          </h2>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            如果在提供服务的过程中需要进行跨境数据传输（例如，用户位于欧盟境内，而其个人信息被传输至美国或其他非欧盟司法辖区），我们将仅在符合《通用数据保护条例》（GDPR）规定的情况下进行此类传输。
          </p>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            如果有需要跨境传输数据以共享信息，例如传输到美国和其他司法管辖区，而应用程序允许用户位于欧盟境内，则个人信息将被传输到欧盟以外的国家/地区，我们会采取以下预防措施，以确保您的个人信息得到适当保护：
          </p>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            当我们在欧盟以外存储或传输您的个人信息时，我们将遵守适用法律，并通过实施适当的保护措施来确保为其提供类似程度的保护。将个人信息传输至：
          </p>
          <ul style={{ marginLeft: '30px', marginBottom: '20px' }}>
            <li style={{ marginBottom: '10px' }}>欧盟委员会认可的可提供充分保护的国家/地区；或</li>
            <li style={{ marginBottom: '10px' }}>不能提供充分保护但其传输受到欧盟委员会标准合同条款约束的国家/地区，或者通过实施其他适当的跨境传输解决方案来提供充分保护的国家/地区。</li>
          </ul>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            使用我们的服务或产品，即表示您了解您的个人信息可能会传输至我们的场所和根据本政策所述的我们向其分享数据的第三方。
          </p>
        </div>
        
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{
            color: '#34495e',
            fontSize: '24px',
            marginTop: '40px',
            marginBottom: '15px',
            paddingLeft: '10px',
            borderLeft: '4px solid #3498db'
          }}>
            十一、您的权利 / Your Rights
          </h2>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            根据适用的数据保护法律，您享有以下权利：
          </p>
          <ul style={{ marginLeft: '30px', marginBottom: '20px' }}>
            <li style={{ marginBottom: '10px' }}><strong>访问权</strong>：您可以随时访问、查看您账户中存储的所有数据</li>
            <li style={{ marginBottom: '10px' }}><strong>更正权</strong>：您可以更正或更新您的个人信息</li>
            <li style={{ marginBottom: '10px' }}><strong>删除权</strong>：您可以请求删除您的账户和相关数据</li>
            <li style={{ marginBottom: '10px' }}><strong>数据导出</strong>：您可以请求导出您的数据</li>
            <li style={{ marginBottom: '10px' }}><strong>撤回同意</strong>：您可以随时撤回对数据处理的同意</li>
          </ul>
        </div>
        
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{
            color: '#34495e',
            fontSize: '24px',
            marginTop: '40px',
            marginBottom: '15px',
            paddingLeft: '10px',
            borderLeft: '4px solid #3498db'
          }}>
            十二、儿童隐私 / Children's Privacy
          </h2>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            本扩展不面向 13 岁以下的儿童。我们不会故意收集 13 岁以下儿童的个人信息。如果您是家长或监护人，发现您的孩子向我们提供了个人信息，请立即联系我们，我们将删除这些信息。
          </p>
        </div>
        
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{
            color: '#34495e',
            fontSize: '24px',
            marginTop: '40px',
            marginBottom: '15px',
            paddingLeft: '10px',
            borderLeft: '4px solid #3498db'
          }}>
            十三、第三方网站 / Third-Party Websites
          </h2>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            本扩展会访问 Amazon 网站以采集评论数据。请注意，Amazon 有自己的隐私政策和服务条款。我们不对 Amazon 的隐私做法负责。
          </p>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            本扩展仅读取 Amazon 网站上的公开信息，不会访问您的 Amazon 账户信息、支付信息或其他私人数据。
          </p>
        </div>
        
        <div style={{
          background: '#ecf0f1',
          padding: '20px',
          borderRadius: '5px',
          marginTop: '30px'
        }}>
          <h2 style={{
            color: '#34495e',
            fontSize: '24px',
            marginTop: '0',
            marginBottom: '15px',
            paddingLeft: '10px',
            borderLeft: '4px solid #3498db'
          }}>
            十四、联系我们 / Contact Us
          </h2>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            如果您对本隐私政策有任何问题、意见或请求，请通过以下方式联系我们：
          </p>
          
          <h3 style={{
            color: '#555',
            fontSize: '20px',
            marginTop: '30px',
            marginBottom: '10px'
          }}>
            联系方式
          </h3>
          <ul style={{ marginLeft: '30px', marginBottom: '20px' }}>
            <li style={{ marginBottom: '10px' }}><strong>邮箱 / Email</strong>：support@98kamz.com</li>
            <li style={{ marginBottom: '10px' }}><strong>网站 / Website</strong>：https://98kamz.com</li>
          </ul>
          
          <p style={{ marginBottom: '15px', textAlign: 'justify' }}>
            我们会在合理时间内回复您的询问。
          </p>
        </div>
        
        <div style={{
          marginTop: '50px',
          paddingTop: '30px',
          borderTop: '2px solid #ecf0f1'
        }}>
          <p style={{
            textAlign: 'center',
            color: '#7f8c8d',
            fontSize: '14px'
          }}>
            © 2026 洞察大王. 保留所有权利。<br />
            © 2026 Insight King. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
