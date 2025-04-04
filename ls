<IfModule mod_ssl.c>
<VirtualHost *:443>
        ServerAdmin localhost
        ServerName mscformularios.elvisrodrigo.com
        ServerAlias mscformularios.elvisrodrigo.com
        DocumentRoot /var/www/html/formularios

        <IfModule mod_proxy.c>
            ProxyPreserveHost On

            ProxyPass /api http://localhost:3001/api
            ProxyPassReverse /api http://localhost:3001/api

            ProxyPass / http://localhost:3000/
            ProxyPassReverse / http://localhost:3000/
        </IfModule>

        # Configuración SSL
        SSLCertificateFile /etc/letsencrypt/live/mscformularios.elvisrodrigo.com/fullchain.pem
        SSLCertificateKeyFile /etc/letsencrypt/live/mscformularios.elvisrodrigo.com/privkey.pem
        Include /etc/letsencrypt/options-ssl-apache.conf

        # Logs
        ErrorLog ${APACHE_LOG_DIR}/mscformularios_error.log
        CustomLog ${APACHE_LOG_DIR}/mscformularios_access.log combined
</VirtualHost>
</IfModule>



<VirtualHost *:80>
        ServerAdmin localhost
        ServerName mscformularios.elvisrodrigo.com
        ServerAlias mscformularios.elvisrodrigo.com
        Redirect / https://mscformularios.elvisrodrigo.com/
RewriteEngine on
RewriteCond %{SERVER_NAME} =mscformularios.elvisrodrigo.com
RewriteRule ^ https://%{SERVER_NAME}%{REQUEST_URI} [END,NE,R=permanent]
</VirtualHost>